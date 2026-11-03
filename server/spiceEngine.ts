import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SpiceResultData {
  scaleName: string;
  scale: number[];
  signals: Record<string, number[]>;
  pointCount: number;
}

export interface SpiceRunResponse {
  ok: boolean;
  jobId: string;
  log: string;
  stdout: string;
  stderr: string;
  durationMs: number;
  exitCode: number | null;
  data?: SpiceResultData;
  error?: string;
}

export interface SpiceStatus {
  available: boolean;
  version: string;
  binaryPath: string;
  osdiAvailable: boolean;
  osdiPath: string;
  runsDir: string;
  uptimeSeconds: number;
}

const SERVER_DIR = path.resolve(__dirname);
const BIN_DIR = path.join(SERVER_DIR, 'bin');
const BUNDLED_NGSPICE = path.join(BIN_DIR, 'ngspice');
const RUNS_DIR = process.env.GW_RUNS || '/tmp/gw-circuit-runs';
const OSDI_FILE = path.join(SERVER_DIR, 'ptft_fit.osdi');
const NGSPICE_BIN =
  process.env.GW_NGSPICE ||
  (fs.existsSync(BUNDLED_NGSPICE)
    ? BUNDLED_NGSPICE
    : fs.existsSync('/usr/local/bin/ngspice')
      ? '/usr/local/bin/ngspice'
      : 'ngspice');

if (!fs.existsSync(RUNS_DIR)) {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
}

export function parseWrdataFile(content: string): SpiceResultData | null {
  const lines = content.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const firstTokens = lines[0].split(/\s+/);
  const isHeader = isNaN(Number(firstTokens[0]));
  const headers = isHeader ? firstTokens : firstTokens.map((_, i) => (i === 0 ? 'scale' : `var_${i}`));
  const dataLines = isHeader ? lines.slice(1) : lines;

  const scale: number[] = [];
  const signals: Record<string, number[]> = {};
  for (let i = 1; i < headers.length; i++) {
    signals[headers[i]] = [];
  }

  for (const line of dataLines) {
    const parts = line.split(/\s+/);
    if (parts.length >= headers.length) {
      scale.push(parseFloat(parts[0]));
      for (let i = 1; i < headers.length; i++) {
        signals[headers[i]].push(parseFloat(parts[i]));
      }
    }
  }

  return {
    scaleName: headers[0] || 'time',
    scale,
    signals,
    pointCount: scale.length,
  };
}

export async function getSpiceStatus(): Promise<SpiceStatus> {
  return new Promise((resolve) => {
    try {
      const ldPath = [BIN_DIR, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
      const proc = spawn(NGSPICE_BIN, ['-v'], {
        env: { ...process.env, LD_LIBRARY_PATH: ldPath },
      });
      let out = '';
      proc.stdout.on('data', (d) => { out += d.toString(); });
      proc.stderr.on('data', (d) => { out += d.toString(); });

      proc.on('close', () => {
        const firstLine = out.split('\n').find((l) => l.includes('ngspice-')) || 'ngspice';
        resolve({
          available: true,
          version: firstLine.trim().replace(/\*+/g, '').trim(),
          binaryPath: NGSPICE_BIN,
          osdiAvailable: fs.existsSync(OSDI_FILE),
          osdiPath: OSDI_FILE,
          runsDir: RUNS_DIR,
          uptimeSeconds: Math.floor(process.uptime()),
        });
      });

      proc.on('error', () => {
        resolve({
          available: false,
          version: 'Not found',
          binaryPath: NGSPICE_BIN,
          osdiAvailable: fs.existsSync(OSDI_FILE),
          osdiPath: OSDI_FILE,
          runsDir: RUNS_DIR,
          uptimeSeconds: Math.floor(process.uptime()),
        });
      });
    } catch {
      resolve({
        available: false,
        version: 'Execution error',
        binaryPath: NGSPICE_BIN,
        osdiAvailable: false,
        osdiPath: OSDI_FILE,
        runsDir: RUNS_DIR,
        uptimeSeconds: Math.floor(process.uptime()),
      });
    }
  });
}

function cleanupOldRuns(maxCount = 200) {
  try {
    const dirs = fs.readdirSync(RUNS_DIR).map((name) => ({
      name,
      path: path.join(RUNS_DIR, name),
      stat: fs.statSync(path.join(RUNS_DIR, name)),
    })).filter((d) => d.stat.isDirectory());

    if (dirs.length > maxCount) {
      dirs.sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
      const toDelete = dirs.slice(0, dirs.length - maxCount);
      for (const d of toDelete) {
        fs.rmSync(d.path, { recursive: true, force: true });
      }
    }
  } catch {
    // ignore cleanup errors
  }
}

export async function runSpiceNetlist(
  netlist: string,
  options: { timeoutMs?: number; autoOsdi?: boolean } = {}
): Promise<SpiceRunResponse> {
  const timeoutMs = Math.min(Math.max(options.timeoutMs || 25000, 1000), 60000);
  const autoOsdi = options.autoOsdi !== false;

  const jobId = `${new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15)}_${crypto.randomBytes(4).toString('hex')}`;
  const jobDir = path.join(RUNS_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  // Auto-link OSDI model if available and referenced or requested
  if (autoOsdi && fs.existsSync(OSDI_FILE)) {
    try {
      const destOsdi = path.join(jobDir, 'ptft_fit.osdi');
      if (!fs.existsSync(destOsdi)) {
        fs.symlinkSync(OSDI_FILE, destOsdi);
      }
    } catch (e) {
      console.warn('[SpiceRunner] Could not symlink OSDI:', e);
    }
  }

  const jobCirPath = path.join(jobDir, 'job.cir');
  fs.writeFileSync(jobCirPath, netlist, 'utf8');

  const startTime = Date.now();

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const ldPath = [BIN_DIR, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
    const child = spawn(NGSPICE_BIN, ['-b', 'job.cir'], {
      cwd: jobDir,
      env: {
        PATH: `${BIN_DIR}:${process.env.PATH || ''}`,
        LD_LIBRARY_PATH: ldPath,
        HOME: jobDir,
        OMP_NUM_THREADS: '1',
      },
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      const combinedLog = (stdout + '\n' + stderr).trim();

      if (timedOut) {
        resolve({
          ok: false,
          jobId,
          stdout,
          stderr,
          log: combinedLog,
          durationMs,
          exitCode: null,
          error: `시뮬레이션 시간 초과 (${timeoutMs / 1000}s 제한). 수렴 실패 또는 무한 루프 가능성.`,
        });
        return;
      }

      // Check if out.txt exists
      const outTxtPath = path.join(jobDir, 'out.txt');
      let data: SpiceResultData | undefined = undefined;
      if (fs.existsSync(outTxtPath)) {
        try {
          const content = fs.readFileSync(outTxtPath, 'utf8');
          const parsed = parseWrdataFile(content);
          if (parsed && parsed.pointCount > 0) {
            data = parsed;
          }
        } catch (e) {
          console.warn('[SpiceRunner] Failed to parse out.txt:', e);
        }
      }

      const hasError = exitCode !== 0 || combinedLog.includes('Simulation interrupted due to error') || combinedLog.includes('Fatal error:');

      // Clean up temporary job directory immediately
      try {
        fs.rmSync(jobDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
      setTimeout(() => cleanupOldRuns(10), 100);

      resolve({
        ok: !hasError,
        jobId,
        stdout,
        stderr,
        log: combinedLog,
        durationMs,
        exitCode,
        data,
        error: hasError ? (combinedLog.split('\n').find((l) => /error/i.test(l)) || 'SPICE 시뮬레이션 오류') : undefined,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      resolve({
        ok: false,
        jobId,
        stdout,
        stderr,
        log: err.message,
        durationMs,
        exitCode: null,
        error: `ngspice 프로세스 실행 실패: ${err.message}`,
      });
    });
  });
}

export const SPICE_PRESETS = [
  {
    id: 'ptft_transfer',
    name: 'p-TFT 전달특성 (Id-Vg 커브 with OSDI)',
    desc: '합성 Verilog-A p-TFT 모델(ptft_fit)을 로드하여 게이트 전압 스윕에 따른 드레인 전류 특성을 측정합니다.',
    netlist: `* p-TFT Id-Vg Transfer Characteristics (Verilog-A OSDI)
.model mt1 ptft_fit W=20u L=4u VT0=0.8000 U0=50.000 SS=0.3500 GOFF=1.0000e-14 POL=1

Vd d 0 -10.0
Vg g 0 0.0
Vs s 0 0.0

N1 d g s mt1

.control
set num_threads=1
pre_osdi ptft_fit.osdi
dc Vg -12.0 2.0 0.2
set wr_singlescale
set wr_vecnames
wrdata out.txt g vd#branch
.endc
.end
`,
  },
  {
    id: 'rc_step',
    name: 'RC 필터 과도 응답 (Step & Pulse Response)',
    desc: '1kΩ 저항과 10nF 커패시터로 구성된 RC 필터의 펄스 충/방전 과도 특성을 시뮬레이션합니다.',
    netlist: `* RC Low-Pass Filter Transient Simulation
Vin in 0 PULSE(0.0 5.0 0.0 10n 10n 10u 20u)
R1 in out 1k
C1 out 0 10n

.tran 50n 30u
.control
set num_threads=1
run
set wr_singlescale
set wr_vecnames
wrdata out.txt v(in) v(out)
.endc
.end
`,
  },
  {
    id: 'rlc_ringing',
    name: 'RLC 직렬 감쇠 진동 (Damped Oscillation)',
    desc: '인덕터와 커패시터에 의한 공진 및 링잉(Ringing) 전압 파형을 관찰합니다.',
    netlist: `* RLC Series Resonant Circuit
Vin in 0 PULSE(0 5 0 1n 1n 20u 40u)
R1 in n1 20
L1 n1 out 100u
C1 out 0 100n

.tran 20n 25u
.control
set num_threads=1
run
set wr_singlescale
set wr_vecnames
wrdata out.txt v(in) v(out)
.endc
.end
`,
  },
  {
    id: 'cmos_inverter',
    name: 'CMOS 인버터 스위칭 과도 특성',
    desc: 'PMOS와 NMOS로 구성된 표준 CMOS 인버터의 상승/하강 지연 시간을 분석합니다.',
    netlist: `* CMOS Inverter Transient Simulation
.model nmos_mod nmos (vto=0.7 kp=120u)
.model pmos_mod pmos (vto=-0.7 kp=50u)

Vdd vdd 0 3.3
Vin in 0 PULSE(0 3.3 1u 50n 50n 5u 10u)

M1 out in 0 0 nmos_mod w=10u l=0.5u
M2 out in vdd vdd pmos_mod w=20u l=0.5u
Cload out 0 50f

.tran 10n 15u
.control
set num_threads=1
run
set wr_singlescale
set wr_vecnames
wrdata out.txt v(in) v(out)
.endc
.end
`,
  },
  {
    id: 'gw_stage',
    name: 'GIP GW 단일 스테이지 구동 (Gate Driver)',
    desc: '디스플레이 패널 게이트 라인을 구동하는 2-Phase 클록 부트스트랩 스캔 스테이지입니다.',
    netlist: `* Display Gate Driver Single Stage Simulation
.model mtft ptft_fit W=25u L=4u VT0=0.8500 U0=55.000 SS=0.3200 GOFF=1e-14 POL=1

VGH vgh 0 8.0
VGL vgl 0 -9.5
Vin in 0 PWL(0u 8.0 2u 8.0 2.05u -9.5 6u -9.5 6.05u 8.0 20u 8.0)
Vclk clk 0 PULSE(8.0 -9.5 4u 50n 50n 4u 8u)

* Bootstrap driver
N_sample q in vgl mtft
C_boot q out 0.4p
N_pullout out clk q mtft
N_hold out vgh clk mtft

.options method=gear reltol=1e-4 abstol=1e-12
.control
set num_threads=1
pre_osdi ptft_fit.osdi
tran 10n 16u
set wr_singlescale
set wr_vecnames
wrdata out.txt v(in) v(clk) v(q) v(out)
.endc
.end
`,
  },
];
