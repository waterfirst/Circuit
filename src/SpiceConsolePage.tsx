import React, { useState, useEffect, useMemo, useRef } from 'react';
import { API } from './api';
import {
  getSavedSpiceNetlists,
  saveSpiceNetlist,
  deleteSpiceNetlist,
  downloadJsonFile,
  downloadSpiceFile,
  SavedSpiceItem,
} from './storage';

interface Preset {
  id: string;
  name: string;
  desc: string;
  netlist: string;
}

interface SpiceStatus {
  available: boolean;
  version: string;
  binaryPath: string;
  osdiAvailable: boolean;
  osdiPath: string;
  runsDir: string;
  uptimeSeconds: number;
}

interface SpiceResult {
  ok: boolean;
  jobId: string;
  log: string;
  stdout: string;
  stderr: string;
  durationMs: number;
  exitCode: number | null;
  error?: string;
  data?: {
    scaleName: string;
    scale: number[];
    signals: Record<string, number[]>;
    pointCount: number;
  };
}

const SIGNAL_COLORS = [
  '#2563eb', // blue
  '#dc2626', // red
  '#16a34a', // green
  '#9333ea', // purple
  '#ea580c', // orange
  '#0891b2', // cyan
  '#d97706', // amber
  '#4f46e5', // indigo
];

export default function SpiceConsolePage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('ptft_transfer');
  const [netlist, setNetlist] = useState<string>('');
  const [status, setStatus] = useState<SpiceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SpiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSignals, setSelectedSignals] = useState<Record<string, boolean>>({});

  // Local Storage state
  const [savedList, setSavedList] = useState<SavedSpiceItem[]>([]);
  const [saveName, setSaveName] = useState<string>('');
  const [selectedSavedId, setSelectedSavedId] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load status, presets and localStorage on mount
  useEffect(() => {
    fetch(`${API}/spice/status`)
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch((e) => console.error('Status fetch error:', e));

    fetch(`${API}/spice/presets`)
      .then((r) => r.json())
      .then((data: Preset[]) => {
        setPresets(data);
        if (data.length > 0) {
          const first = data[0];
          setSelectedPresetId(first.id);
          setNetlist(first.netlist);
          setSaveName(first.name);
        }
      })
      .catch((e) => console.error('Presets fetch error:', e));

    loadSavedList();
  }, []);

  const loadSavedList = () => {
    const list = getSavedSpiceNetlists();
    setSavedList(list);
    if (list.length > 0 && !selectedSavedId) {
      setSelectedSavedId(list[0].id);
    }
  };

  const handleSelectPreset = (id: string) => {
    setSelectedPresetId(id);
    const p = presets.find((x) => x.id === id);
    if (p) {
      setNetlist(p.netlist);
      setSaveName(p.name);
    }
  };

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  // Save current netlist to localStorage
  const handleSaveToLocalStorage = () => {
    if (!netlist.trim()) {
      showNotice('⚠ 저장할 넷리스트가 비어 있습니다.');
      return;
    }
    const name = saveName.trim() || `넷리스트_${new Date().toLocaleTimeString()}`;
    const saved = saveSpiceNetlist(name, netlist);
    loadSavedList();
    setSelectedSavedId(saved.id);
    showNotice(`✓ "${name}" 회로가 로컬 스토리지에 JSON 형태로 저장되었습니다.`);
  };

  // Load selected netlist from localStorage
  const handleLoadFromLocalStorage = () => {
    const item = savedList.find((x) => x.id === selectedSavedId);
    if (!item) {
      showNotice('⚠ 불러올 저장 항목을 선택해주세요.');
      return;
    }
    setNetlist(item.netlist);
    setSaveName(item.name);
    showNotice(`✓ "${item.name}" 회로를 로컬 스토리지에서 불러왔습니다.`);
  };

  // Delete selected netlist from localStorage
  const handleDeleteFromLocalStorage = () => {
    const item = savedList.find((x) => x.id === selectedSavedId);
    if (!item) return;
    deleteSpiceNetlist(item.id);
    const updated = getSavedSpiceNetlists();
    setSavedList(updated);
    setSelectedSavedId(updated[0]?.id || '');
    showNotice(`✓ "${item.name}" 회로가 로컬 스토리지에서 삭제되었습니다.`);
  };

  // Export current netlist as JSON file
  const handleExportJson = () => {
    const data = {
      name: saveName.trim() || 'custom_spice_netlist',
      netlist,
      exportedAt: new Date().toISOString(),
      format: 'gw-circuit-netlist-v1',
    };
    downloadJsonFile(`${(saveName.trim() || 'spice_netlist').replace(/\s+/g, '_')}.json`, data);
    showNotice('✓ JSON 파일로 내보냈습니다.');
  };

  // Export current netlist as .sp file
  const handleExportSp = () => {
    if (!netlist.trim()) {
      showNotice('⚠ 내보낼 넷리스트가 비어 있습니다.');
      return;
    }
    const filename = (saveName.trim() || selectedPresetId || 'spice_netlist').replace(/\s+/g, '_');
    downloadSpiceFile(filename, netlist);
    showNotice(`✓ "${filename}.sp" 넷리스트 파일로 내보냈습니다.`);
  };

  // Import netlist from JSON file
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        // Can be a single netlist object or an array of items
        if (Array.isArray(parsed)) {
          let count = 0;
          parsed.forEach((item: any) => {
            if (item.netlist && typeof item.netlist === 'string') {
              saveSpiceNetlist(item.name || `가져온 회로_${++count}`, item.netlist, item.description);
            }
          });
          loadSavedList();
          showNotice(`✓ ${parsed.length}개 회로 구성을 가져와 로컬 스토리지에 저장했습니다.`);
        } else if (parsed.netlist && typeof parsed.netlist === 'string') {
          const name = parsed.name || file.name.replace(/\.[^/.]+$/, '');
          setNetlist(parsed.netlist);
          setSaveName(name);
          const saved = saveSpiceNetlist(name, parsed.netlist, parsed.description);
          loadSavedList();
          setSelectedSavedId(saved.id);
          showNotice(`✓ "${name}" 회로를 가져와 로컬 스토리지에 저장했습니다.`);
        } else {
          showNotice('⚠ 올바른 회로 JSON 형식이 아닙니다 (netlist 속성 누락).');
        }
      } catch (err: any) {
        showNotice(`⚠ JSON 파싱 오류: ${err.message}`);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const runSimulation = async () => {
    if (!netlist.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API}/spice/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ netlist, timeoutMs: 30000 }),
      });

      const data: SpiceResult = await res.json();
      setResult(data);

      if (!data.ok && data.error) {
        setError(data.error);
      }

      if (data.data && data.data.signals) {
        const sigNames = Object.keys(data.data.signals);
        const initialVisible: Record<string, boolean> = {};
        sigNames.forEach((name) => { initialVisible[name] = true; });
        setSelectedSignals(initialVisible);
      }
    } catch (err: any) {
      setError(err.message || '시뮬레이션 요청 실패');
    } finally {
      setLoading(false);
    }
  };

  // Compute waveform bounds & paths for SVG plot
  const plotData = useMemo(() => {
    if (!result?.data || result.data.pointCount === 0) return null;
    const { scale, signals, scaleName } = result.data;
    const activeNames = Object.keys(signals).filter((name) => selectedSignals[name] !== false);
    if (activeNames.length === 0) return null;

    let minX = scale[0];
    let maxX = scale[scale.length - 1];
    if (minX > maxX) [minX, maxX] = [maxX, minX];
    const spanX = maxX - minX || 1;

    let minY = Infinity;
    let maxY = -Infinity;
    activeNames.forEach((sig) => {
      const vals = signals[sig];
      for (let i = 0; i < vals.length; i++) {
        const v = vals[i];
        if (!isNaN(v) && isFinite(v)) {
          if (v < minY) minY = v;
          if (v > maxY) maxY = v;
        }
      }
    });

    if (!isFinite(minY) || !isFinite(maxY)) {
      minY = -1;
      maxY = 1;
    }
    if (minY === maxY) {
      minY -= 1;
      maxY += 1;
    }
    const padY = (maxY - minY) * 0.05;
    minY -= padY;
    maxY += padY;
    const spanY = maxY - minY;

    const width = 800;
    const height = 300;
    const padL = 65;
    const padR = 20;
    const padT = 20;
    const padB = 35;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const toSvgX = (x: number) => padL + ((x - minX) / spanX) * plotW;
    const toSvgY = (y: number) => padT + plotH - ((y - minY) / spanY) * plotH;

    const series = activeNames.map((name, idx) => {
      const vals = signals[name];
      const pts: string[] = [];
      for (let i = 0; i < scale.length; i++) {
        const x = toSvgX(scale[i]);
        const y = toSvgY(vals[i]);
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      return {
        name,
        color: SIGNAL_COLORS[idx % SIGNAL_COLORS.length],
        path: 'M' + pts.join(' L'),
      };
    });

    return {
      width,
      height,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      minX,
      maxX,
      minY,
      maxY,
      scaleName,
      series,
    };
  }, [result, selectedSignals]);

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⚡</span> Express.js ngspice 시뮬레이션 환경
          </h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Node.js / Express.js 서버가 직접 ngspice 45 바이너리를 호출하여 SPICE 넷리스트를 시뮬레이션하고 결과를 파싱합니다.
          </p>
        </div>

        {status && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.8rem', background: 'var(--bg)', padding: '6px 12px', borderRadius: 6, border: '1px solid var(--line)' }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: status.available ? '#22c55e' : '#ef4444' }} />
            <span><strong>ngspice:</strong> {status.available ? '정상 작동' : '오류'}</span>
            <span style={{ color: 'var(--muted)' }}>|</span>
            <span><strong>OSDI 모델:</strong> {status.osdiAvailable ? 'ptft_fit.osdi 로드됨' : '없음'}</span>
          </div>
        )}
      </div>

      {notice && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--good-bg)', color: 'var(--good)', border: '1px solid var(--good)', borderRadius: 6, fontSize: '0.85rem' }}>
          {notice}
        </div>
      )}

      {/* LocalStorage JSON Save/Load Toolbar */}
      <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--lane)', borderRadius: 8, border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>💾</span> 로컬 스토리지 회로 저장/불러오기 (JSON)
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="ghost"
              style={{ fontSize: '0.8rem', padding: '4px 8px', color: 'var(--accent)', fontWeight: 600 }}
              onClick={handleExportSp}
              title="현재 편집된 넷리스트를 .sp 파일로 다운로드"
            >
              📄 Export Netlist (.sp)
            </button>
            <button
              type="button"
              className="ghost"
              style={{ fontSize: '0.8rem', padding: '4px 8px' }}
              onClick={handleExportJson}
              title="현재 회로를 .json 파일로 다운로드"
            >
              ⬇ JSON 내보내기
            </button>
            <button
              type="button"
              className="ghost"
              style={{ fontSize: '0.8rem', padding: '4px 8px' }}
              onClick={() => fileInputRef.current?.click()}
              title="저장된 회로 .json 파일 업로드"
            >
              ⬆ JSON 가져오기
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleImportJson}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="저장할 회로 이름 입력..."
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '0.88rem', minWidth: 200, flex: 1 }}
          />
          <button
            type="button"
            className="primary"
            onClick={handleSaveToLocalStorage}
            style={{ padding: '6px 12px', fontSize: '0.88rem' }}
          >
            💾 로컬에 저장
          </button>

          <span style={{ color: 'var(--line)', margin: '0 4px' }}>|</span>

          <select
            value={selectedSavedId}
            onChange={(e) => setSelectedSavedId(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '0.88rem', minWidth: 220 }}
            disabled={savedList.length === 0}
          >
            {savedList.length === 0 ? (
              <option value="">저장된 회로 없음 (0개)</option>
            ) : (
              savedList.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({new Date(item.updatedAt).toLocaleDateString()})
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            onClick={handleLoadFromLocalStorage}
            disabled={savedList.length === 0}
            style={{ padding: '6px 10px', fontSize: '0.88rem' }}
          >
            📂 불러오기
          </button>
          <button
            type="button"
            className="ghost"
            onClick={handleDeleteFromLocalStorage}
            disabled={savedList.length === 0}
            style={{ padding: '6px 8px', fontSize: '0.88rem', color: 'var(--bad)' }}
            title="선택된 회로 삭제"
          >
            🗑
          </button>
        </div>
      </div>

      {/* Preset selector */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.88rem', fontWeight: 600 }}>기본 제공 예제:</label>
        <select
          value={selectedPresetId}
          onChange={(e) => handleSelectPreset(e.target.value)}
          style={{ padding: '5px 8px', fontSize: '0.88rem', borderRadius: 6, minWidth: 240 }}
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {presets.find((p) => p.id === selectedPresetId)?.desc && (
          <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
            {presets.find((p) => p.id === selectedPresetId)?.desc}
          </span>
        )}
      </div>

      {/* Netlist editor */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
            SPICE 넷리스트 입력 (.cir / .control 블록 내 wrdata out.txt 지원)
          </span>
          <button
            type="button"
            className="ghost"
            style={{ fontSize: '0.8rem', padding: '2px 8px' }}
            onClick={() => setNetlist('')}
          >
            지우기
          </button>
        </div>
        <textarea
          value={netlist}
          onChange={(e) => setNetlist(e.target.value)}
          rows={14}
          style={{
            width: '100%',
            fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
            fontSize: '13px',
            lineHeight: 1.45,
            padding: 10,
            borderRadius: 6,
            border: '1px solid var(--line)',
            background: 'var(--bg)',
            color: 'var(--fg)',
            whiteSpace: 'pre',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Action bar */}
      <div className="runbar">
        <button
          type="button"
          className="primary"
          onClick={runSimulation}
          disabled={loading || !netlist.trim()}
          style={{ minWidth: 150 }}
        >
          {loading ? 'ngspice 시뮬레이션 중...' : '▶ ngspice 시뮬레이션 실행'}
        </button>

        {result && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: '0.85rem' }}>
            <span style={{ color: result.ok ? 'var(--good)' : 'var(--bad)', fontWeight: 600 }}>
              {result.ok ? '✓ 시뮬레이션 완료' : '⚠ 시뮬레이션 오류'}
            </span>
            <span>소요 시간: <strong>{result.durationMs} ms</strong></span>
            {result.data && (
              <span>데이터 포인트: <strong>{result.data.pointCount.toLocaleString()} 개</strong></span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="card bad" style={{ margin: '10px 0', padding: 10 }}>
          <strong>오류 발생:</strong> {error}
        </div>
      )}

      {/* Waveform Visualization */}
      {plotData && (
        <div className="card" style={{ marginTop: 14, background: 'var(--card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>시뮬레이션 파형 (Waveform Viewer)</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.8rem' }}>
              {Object.keys(result!.data!.signals).map((sig, idx) => {
                const color = SIGNAL_COLORS[idx % SIGNAL_COLORS.length];
                const checked = selectedSignals[sig] !== false;
                return (
                  <label key={sig} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setSelectedSignals((prev) => ({ ...prev, [sig]: e.target.checked }));
                      }}
                    />
                    <span style={{ color, fontWeight: 600 }}>{sig}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <svg
              viewBox={`0 0 ${plotData.width} ${plotData.height}`}
              style={{ width: '100%', maxWidth: 800, height: 'auto', display: 'block', background: 'var(--lane)', borderRadius: 6 }}
            >
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                const y = plotData.padT + plotData.plotH * frac;
                const val = plotData.maxY - (plotData.maxY - plotData.minY) * frac;
                return (
                  <g key={`y-${frac}`}>
                    <line
                      x1={plotData.padL}
                      y1={y}
                      x2={plotData.padL + plotData.plotW}
                      y2={y}
                      stroke="var(--grid)"
                      strokeWidth="1"
                    />
                    <text
                      x={plotData.padL - 6}
                      y={y + 3}
                      fill="var(--muted)"
                      fontSize="9"
                      textAnchor="end"
                      fontFamily="monospace"
                    >
                      {val.toExponential(2).replace(/e\+0/g, 'e').replace(/e\+/g, 'e')}
                    </text>
                  </g>
                );
              })}

              {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                const x = plotData.padL + plotData.plotW * frac;
                const val = plotData.minX + (plotData.maxX - plotData.minX) * frac;
                return (
                  <g key={`x-${frac}`}>
                    <line
                      x1={x}
                      y1={plotData.padT}
                      x2={x}
                      y2={plotData.padT + plotData.plotH}
                      stroke="var(--grid)"
                      strokeWidth="1"
                    />
                    <text
                      x={x}
                      y={plotData.height - 12}
                      fill="var(--muted)"
                      fontSize="9"
                      textAnchor="middle"
                      fontFamily="monospace"
                    >
                      {val.toExponential(2).replace(/e\+0/g, 'e').replace(/e\+/g, 'e')}
                    </text>
                  </g>
                );
              })}

              {/* Axis labels */}
              <text
                x={plotData.padL + plotData.plotW / 2}
                y={plotData.height - 2}
                fill="var(--fg)"
                fontSize="10"
                textAnchor="middle"
                fontWeight="500"
              >
                {plotData.scaleName}
              </text>

              {/* Signal Paths */}
              {plotData.series.map((s) => (
                <path
                  key={s.name}
                  d={s.path}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              ))}
            </svg>
          </div>
        </div>
      )}

      {/* Execution Log */}
      {result && (
        <div style={{ marginTop: 14 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem' }}>ngspice 콘솔 출력 로그 (stdout / stderr)</h3>
          <pre
            style={{
              fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
              fontSize: '12px',
              lineHeight: 1.4,
              padding: 10,
              background: 'var(--bg)',
              color: 'var(--fg)',
              borderRadius: 6,
              border: '1px solid var(--line)',
              maxHeight: 280,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
            }}
          >
            {result.log || '(출력 로그 없음)'}
          </pre>
        </div>
      )}
    </div>
  );
}
