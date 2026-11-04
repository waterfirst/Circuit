import { useEffect, useMemo, useRef, useState } from "react";
import AgingPanel from "./AgingPanel";
import AutoStageDiagram from "./AutoStageDiagram";
import DriverDiagram, { DIAGRAM_KEYS } from "./DriverDiagrams";
import MarginMap from "./MarginMap";
import Schematic from "./Schematic";
import Waveforms from "./Waveforms";
import { CAP_NETS, Circuit, CustomTftModel, Deg, DiodeSpec, PIN_NETS, SimResult, Tft } from "./types";
import {
  getSavedDriverCircuits,
  saveDriverCircuit,
  deleteDriverCircuit,
  downloadJsonFile,
  downloadSpiceFile,
  SavedDriverCircuit,
} from "./storage";

import { API } from "./api";

const ensureNeg = (v: number) => (isNaN(v) ? -8 : v === 0 ? 0 : -Math.abs(v));

function Num({ label, value, onChange, step = 0.1, unit }: {
  label: string; value: number | undefined; onChange: (v: number) => void; step?: number; unit?: string;
}) {
  return (
    <label className="num">
      <span>{label}</span>
      <input type="number" step={step} value={value ?? ""}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
      {unit && <em>{unit}</em>}
    </label>
  );
}

function NetSelect({ value, nets, onChange }: { value: string; nets: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {nets.map((n) => <option key={n}>{n}</option>)}
    </select>
  );
}

export default function DriverPage() {
  const [presets, setPresets] = useState<Record<string, Circuit>>({});
  const [c, setC] = useState<Circuit | null>(null);
  const [res, setRes] = useState<SimResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [optBusy, setOptBusy] = useState<string | null>(null);
  const [optLogs, setOptLogs] = useState<string[]>([]);
  const [netErr, setNetErr] = useState("");
  const [stage, setStage] = useState(1);
  const [showNet, setShowNet] = useState(false);
  const [presetKey, setPresetKey] = useState("8T");
  const [showAutoDrawing, setShowAutoDrawing] = useState(true);

  // Custom TFT Model addition state
  const [newModelName, setNewModelName] = useState("LTPO_CUSTOM");
  const [newModelType, setNewModelType] = useState<"P" | "N">("P");
  const [newModelVt0, setNewModelVt0] = useState(1.0);
  const [newModelU0, setNewModelU0] = useState(75);
  const [newModelSs, setNewModelSs] = useState(0.28);
  const [newModelGoff, setNewModelGoff] = useState(1e-12);
  const modelFileInputRef = useRef<HTMLInputElement>(null);

  // Local Storage for Circuit Configs
  const [savedCircuits, setSavedCircuits] = useState<SavedDriverCircuit[]>([]);
  const [saveCircuitName, setSaveCircuitName] = useState<string>("");
  const [selectedSavedCircuitId, setSelectedSavedCircuitId] = useState<string>("");
  const [circuitNotice, setCircuitNotice] = useState<string | null>(null);
  const driverFileInputRef = useRef<HTMLInputElement>(null);

  const loadSavedList = () => {
    const list = getSavedDriverCircuits();
    setSavedCircuits(list);
    if (list.length > 0 && !selectedSavedCircuitId) {
      setSelectedSavedCircuitId(list[0].id);
    }
  };

  useEffect(() => {
    loadSavedList();
  }, []);

  const showCircuitNotice = (msg: string) => {
    setCircuitNotice(msg);
    setTimeout(() => setCircuitNotice(null), 4000);
  };

  const handleSaveCircuit = () => {
    if (!c) return;
    const name = saveCircuitName.trim() || c.name || `내 회로_${new Date().toLocaleTimeString()}`;
    const saved = saveDriverCircuit(name, { ...c, name });
    loadSavedList();
    setSelectedSavedCircuitId(saved.id);
    showCircuitNotice(`✓ "${name}" 회로가 로컬 스토리지에 JSON 형태로 저장되었습니다.`);
  };

  const handleLoadCircuit = () => {
    const item = savedCircuits.find((x) => x.id === selectedSavedCircuitId);
    if (!item) {
      showCircuitNotice("⚠ 불러올 저장 항목을 선택해주세요.");
      return;
    }
    setC(structuredClone(item.circuit));
    setPresetKey(item.name);
    setSaveCircuitName(item.name);
    setRes(null);
    showCircuitNotice(`✓ "${item.name}" 회로를 로컬 스토리지에서 불러왔습니다.`);
  };

  const handleDeleteCircuit = () => {
    const item = savedCircuits.find((x) => x.id === selectedSavedCircuitId);
    if (!item) return;
    deleteDriverCircuit(item.id);
    const updated = getSavedDriverCircuits();
    setSavedCircuits(updated);
    setSelectedSavedCircuitId(updated[0]?.id || "");
    showCircuitNotice(`✓ "${item.name}" 회로가 로컬 스토리지에서 삭제되었습니다.`);
  };

  const handleExportCircuitJson = () => {
    if (!c) return;
    const name = (saveCircuitName.trim() || c.name || "circuit").replace(/\s+/g, "_");
    downloadJsonFile(`${name}.json`, c);
    showCircuitNotice("✓ 회로 구성이 JSON 파일로 다운로드되었습니다.");
  };

  const handleExportNetlistSp = async () => {
    if (!c) return;
    const filename = (c.name || saveCircuitName || "gw_driver").replace(/\s+/g, "_");
    if (res?.netlist) {
      downloadSpiceFile(filename, res.netlist);
      showCircuitNotice(`✓ "${filename}.sp" 넷리스트 파일이 다운로드되었습니다.`);
      return;
    }
    try {
      const resp = await fetch(API + "/netlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "driver", desc: c }),
      });
      const data = await resp.json();
      if (data.ok && data.netlist) {
        downloadSpiceFile(filename, data.netlist);
        showCircuitNotice(`✓ "${filename}.sp" 넷리스트 파일이 다운로드되었습니다.`);
      } else {
        showCircuitNotice("⚠ 넷리스트 생성 실패: " + (data.errors || []).join(", "));
      }
    } catch (err: any) {
      showCircuitNotice("⚠ 넷리스트 생성 오류: " + err.message);
    }
  };

  const handleImportCircuitJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (parsed && parsed.tft && Array.isArray(parsed.caps)) {
          const name = parsed.name || file.name.replace(/\.[^/.]+$/, "");
          parsed.name = name;
          if (parsed.VGL > 0) parsed.VGL = -Math.abs(parsed.VGL);
          setC(parsed);
          setSaveCircuitName(name);
          const saved = saveDriverCircuit(name, parsed);
          loadSavedList();
          setSelectedSavedCircuitId(saved.id);
          setRes(null);
          showCircuitNotice(`✓ "${name}" 회로 구성을 가져와 로컬 스토리지에 저장했습니다.`);
        } else {
          showCircuitNotice("⚠ 올바른 회로 JSON 형식이 아닙니다 (tft, caps 필드 필요).");
        }
      } catch (err: any) {
        showCircuitNotice(`⚠ JSON 파싱 오류: ${err.message}`);
      }
      if (driverFileInputRef.current) driverFileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const handleImportModelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !c) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const txt = String(event.target?.result || "");
        if (file.name.endsWith(".json")) {
          const j = JSON.parse(txt);
          const list: CustomTftModel[] = Array.isArray(j) ? j : [j];
          const valid = list.filter((m) => m && m.name).map((m) => ({
            name: String(m.name),
            type: (m.type === "N" ? "N" : "P") as "P" | "N",
            VT0: Number(m.VT0 ?? 1.0),
            U0: Number(m.U0 ?? 50),
            SS: Number(m.SS ?? 0.3),
            GOFF: Number(m.GOFF ?? 1e-12),
          }));
          setC({ ...c, custom_models: [...(c.custom_models ?? []), ...valid] });
          showCircuitNotice(`✓ ${valid.length}개 커스텀 TFT 모델을 불러왔습니다.`);
        } else {
          // Parse SPICE .model line if present
          const mName = file.name.replace(/\.[^/.]+$/, "").replace(/\W+/g, "_").toUpperCase();
          const isN = /nmos|ntft|igzo|oxide/i.test(txt);
          const vtMatch = txt.match(/vt0\s*=\s*([+-]?[\d.eE+-]+)/i);
          const u0Match = txt.match(/u0\s*=\s*([+-]?[\d.eE+-]+)/i);
          const ssMatch = txt.match(/ss\s*=\s*([+-]?[\d.eE+-]+)/i);
          const newM: CustomTftModel = {
            name: mName || "IMPORTED_MOD",
            type: isN ? "N" : "P",
            VT0: vtMatch ? Math.abs(parseFloat(vtMatch[1])) : 1.0,
            U0: u0Match ? parseFloat(u0Match[1]) : 50,
            SS: ssMatch ? parseFloat(ssMatch[1]) : 0.3,
            GOFF: 1e-12,
          };
          setC({ ...c, custom_models: [...(c.custom_models ?? []), newM] });
          showCircuitNotice(`✓ SPICE 모델 파일에서 "${newM.name}" (${newM.type}형) 모델을 불러왔습니다.`);
        }
      } catch (err: any) {
        showCircuitNotice(`⚠ 모델 파일 파싱 실패: ${err.message}`);
      }
      if (modelFileInputRef.current) modelFileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    fetch(API + "/presets").then((r) => r.json()).then((p) => {
      setPresets(p);
      setC(structuredClone(p["8T"]));
    }).catch(() => setNetErr("시뮬레이션 서버에 연결할 수 없어요. 잠시 후 새로고침해 보세요."));
  }, []);

  const set = <K extends keyof Circuit>(k: K, v: Circuit[K]) => c && setC({ ...c, [k]: v });
  const setTft = (name: string, patch: Partial<Tft>) =>
    c && setC({ ...c, tft: { ...c.tft, [name]: { ...c.tft[name], ...patch } } });

  const addTft = () => {
    if (!c) return;
    const free = Array.from({ length: 16 }, (_, i) => `T${i + 1}`).find((n) => !(n in c.tft));
    if (free) setTft(free, { type: "P", G: "VGL", S: "VGH", D: "QB", W: 4, L: 4.5, dVT: 0, bml: false, bml_node: "VGH" });
  };
  const delTft = (name: string) => {
    if (!c) return;
    const { [name]: _, ...rest } = c.tft;
    setC({ ...c, tft: rest });
  };

  const addDiode = () => {
    if (!c) return;
    const list = c.diodes ?? [];
    const nextIdx = list.length + 1;
    setC({ ...c, diodes: [...list, { name: `D${nextIdx}`, a: "IN", k: "Q", IS: 1e-14, N: 1.5 }] });
  };

  const updateDiode = (idx: number, patch: Partial<DiodeSpec>) => {
    if (!c) return;
    const list = [...(c.diodes ?? [])];
    list[idx] = { ...list[idx], ...patch };
    setC({ ...c, diodes: list });
  };

  const removeDiode = (idx: number) => {
    if (!c) return;
    setC({ ...c, diodes: (c.diodes ?? []).filter((_, j) => j !== idx) });
  };

  const addCustomModel = () => {
    if (!c || !newModelName.trim()) return;
    const cleanName = newModelName.trim().replace(/\s+/g, "_");
    const existing = (c.custom_models ?? []).filter((m) => m.name !== cleanName);
    const model: CustomTftModel = {
      name: cleanName,
      type: newModelType,
      VT0: newModelVt0,
      U0: newModelU0,
      SS: newModelSs,
      GOFF: newModelGoff,
    };
    setC({ ...c, custom_models: [...existing, model] });
    showCircuitNotice(`✓ 커스텀 TFT 모델 "${cleanName}" (${newModelType}형)이 추가되었습니다.`);
  };

  const run = async () => {
    if (!c) return;
    setBusy(true); setNetErr("");
    try {
      const r = await fetch(API + "/simulate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c),
      });
      const j: SimResult = await r.json();
      setRes(j);
      setStage(1);
    } catch {
      setNetErr("요청 실패: 서버 응답 없음");
    } finally {
      setBusy(false);
    }
  };

  const runOptimizer = async (endpoint: "params" | "signals" | "timing" | "wizard", label: string) => {
    if (!c) return;
    setOptBusy(label);
    setNetErr("");
    try {
      const r = await fetch(`${API}/optimize/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "driver", desc: c }),
      });
      const j = await r.json();
      if (j.ok && j.best_desc) {
        setC(j.best_desc);
        if (j.sim) setRes(j.sim);
        setOptLogs(j.logs || []);
        setShowAutoDrawing(true);
        showCircuitNotice(`✓ [${label}] 완료: ${(j.logs || []).join(" / ")}`);
      } else {
        setNetErr((j.errors || ["최적화 실패"]).join(", "));
      }
    } catch (e: any) {
      setNetErr(`최적화 요청 실패: ${e.message}`);
    } finally {
      setOptBusy(null);
    }
  };

  const rows = useMemo(() => {
    if (!res?.series || !c) return [];
    const s = res.series;
    const out = [
      { key: "FLM", label: "FLM", data: s["v(FLM)"] },
      { key: "CLK1", label: "CLK1", data: s["v(CLK1)"] },
      { key: "CLK2", label: "CLK2", data: s["v(CLK2)"] },
    ];
    for (let i = 1; i <= c.stages; i++) {
      const d = s[`v(OUT${i})`];
      if (d) out.push({ key: `OUT${i}`, label: `OUT${i}`, data: d });
    }
    for (const n of res.internal ?? []) {
      const d = s[`v(x${stage}.${n.toLowerCase()})`];
      if (d) out.push({ key: `N${n}`, label: `${stage}단 ${n}`, data: d });
    }
    return out;
  }, [res, c, stage]);

  const sameTopo = useMemo(() => {
    const p = presets[presetKey];
    if (!c || !p || !DIAGRAM_KEYS.has(presetKey)) return false;
    if ((c.diodes ?? []).length > 0) return false;
    const a = Object.keys(c.tft).sort(), b = Object.keys(p.tft).sort();
    if (a.join() !== b.join() || c.caps.length !== p.caps.length) return false;
    return a.every((k) => (["G", "S", "D"] as const).every((x) => c.tft[k][x] === p.tft[k][x]) && (c.tft[k].type ?? "P") === (p.tft[k].type ?? "P"))
      && c.caps.every((q, i) => q.a === p.caps[i].a && q.b === p.caps[i].b);
  }, [c, presets, presetKey]);

  if (!c) return netErr ? <section className="card bad"><h2>연결 안 됨</h2><p>{netErr}</p></section> : <p>불러오는 중…</p>;

  const names = Object.keys(c.tft).sort((a, b) => +a.slice(1) - +b.slice(1));
  const v = res?.verdict;
  const pModel = c.models?.P ?? { VT0: c.VT0 ?? 1.1, U0: c.U0 ?? 65, SS: 0.28, GOFF: 1e-12 };
  const nModel = c.models?.N ?? { VT0: 0.9, U0: 15, SS: 0.22, GOFF: 1e-14 };

  return (
    <div>
      {circuitNotice && (
        <div style={{ marginBottom: 12, padding: "8px 12px", background: "var(--good-bg)", color: "var(--good)", border: "1px solid var(--good)", borderRadius: 6, fontSize: "0.85rem" }}>
          {circuitNotice}
        </div>
      )}

      {/* LocalStorage Circuit Persistence Toolbar */}
      <section className="card" style={{ background: "var(--lane)", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: "0.9rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <span>💾</span> 내 회로 설정 로컬 저장소 (LocalStorage JSON)
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="ghost"
              style={{ fontSize: "0.8rem", padding: "4px 8px", color: "var(--accent)", fontWeight: 600 }}
              onClick={handleExportNetlistSp}
              title="현재 편집된 회로 넷리스트를 .sp 파일로 다운로드"
            >
              📄 Export Netlist (.sp)
            </button>
            <button
              type="button"
              className="ghost"
              style={{ fontSize: "0.8rem", padding: "4px 8px" }}
              onClick={handleExportCircuitJson}
              title="현재 회로 설정을 JSON 파일로 다운로드"
            >
              ⬇ JSON 내보내기
            </button>
            <button
              type="button"
              className="ghost"
              style={{ fontSize: "0.8rem", padding: "4px 8px" }}
              onClick={() => driverFileInputRef.current?.click()}
              title="회로 설정 JSON 파일 업로드"
            >
              ⬆ JSON 가져오기
            </button>
            <input
              ref={driverFileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={handleImportCircuitJson}
            />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="저장할 회로 이름 입력..."
            value={saveCircuitName}
            onChange={(e) => setSaveCircuitName(e.target.value)}
            style={{ padding: "6px 10px", fontSize: "0.88rem", minWidth: 200, flex: 1 }}
          />
          <button
            type="button"
            className="primary"
            onClick={handleSaveCircuit}
            style={{ padding: "6px 12px", fontSize: "0.88rem" }}
          >
            💾 내 회로 저장
          </button>

          <span style={{ color: "var(--line)", margin: "0 4px" }}>|</span>

          <select
            value={selectedSavedCircuitId}
            onChange={(e) => setSelectedSavedCircuitId(e.target.value)}
            style={{ padding: "6px 10px", fontSize: "0.88rem", minWidth: 220 }}
            disabled={savedCircuits.length === 0}
          >
            {savedCircuits.length === 0 ? (
              <option value="">저장된 내 회로 없음 (0개)</option>
            ) : (
              savedCircuits.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({new Date(item.updatedAt).toLocaleDateString()})
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            onClick={handleLoadCircuit}
            disabled={savedCircuits.length === 0}
            style={{ padding: "6px 10px", fontSize: "0.88rem" }}
          >
            📂 불러오기
          </button>
          <button
            type="button"
            className="ghost"
            onClick={handleDeleteCircuit}
            disabled={savedCircuits.length === 0}
            style={{ padding: "6px 8px", fontSize: "0.88rem", color: "var(--bad)" }}
            title="선택된 회로 삭제"
          >
            🗑
          </button>
        </div>
      </section>

      <section className="card">
        <div className="row wrapline">
          <label className="num"><span>예제 회로</span>
            <select value="" onChange={(e) => { if (e.target.value) { setC(structuredClone(presets[e.target.value])); setPresetKey(e.target.value); setRes(null); } }}>
              <option value="">불러오기…</option>
              {Object.entries(presets).map(([k, p]) => <option key={k} value={k}>{p.name}</option>)}
            </select>
          </label>
          <span className="hint">현재: {c.name ?? "사용자 회로"}</span>
        </div>
        <div className="grid4">
          <Num label="VGH" unit="V" value={c.VGH} onChange={(x) => set("VGH", x)} />
          <Num label="VGL (-자동입력)" unit="V" value={c.VGL} onChange={(x) => set("VGL", ensureNeg(x))} />
          <Num label="라인 주파수" unit="kHz" step={10} value={c.freq_kHz} onChange={(x) => set("freq_kHz", x)} />
          <Num label="단 수" step={1} value={c.stages} onChange={(x) => set("stages", Math.round(x))} />
          <Num label="프레임 수" step={1} value={c.frames} onChange={(x) => set("frames", Math.round(x))} />
          <Num label="홀드 시간" unit="µs" step={10} value={c.hold_us} onChange={(x) => set("hold_us", x)} />
          <label className="num"><span>클럭</span>
            <select value={c.clock_mode} onChange={(e) => set("clock_mode", e.target.value as Circuit["clock_mode"])}>
              <option value="continuous">계속 토글 (현장 구동)</option>
              <option value="burst">스캔 때만 (홀드 중 정지)</option>
            </select>
          </label>
          <label className="num"><span>출력 형태</span>
            <select value={c.output ?? "low_pulse"} onChange={(e) => set("output", e.target.value as Circuit["output"])}>
              <option value="low_pulse">Low 펄스 (GW 스캔)</option>
              <option value="high_pulse">High 펄스 (EM·GC·GI)</option>
            </select>
          </label>
          {c.output === "high_pulse" && (
            <Num label="시작 펄스 폭" unit="H" step={1} value={c.start_width_H ?? 4} onChange={(x) => set("start_width_H", x)} />
          )}
          <Num label="온도" unit="°C" step={5} value={c.temp_C ?? 25} onChange={(x) => set("temp_C", x)} />
          <Num label={c.output === "high_pulse" ? "쉬는 레벨 스펙(≤)" : "OUT Low 스펙"} unit="V" value={c.out_low_req ?? -6} onChange={(x) => set("out_low_req", x)} />
        </div>

        <details style={{ marginTop: 10 }}>
          <summary>고급 설정 & PMOS / NMOS / 임의(Custom) TFT 모델 관리</summary>
          <div className="grid4" style={{ marginTop: 8 }}>
            <Num label="PMOS |Vth| (VT0)" unit="V" value={pModel.VT0} onChange={(x) => { set("VT0", x); set("models", { P: { ...pModel, VT0: x }, N: nModel }); }} />
            <Num label="PMOS 이동도 (U0)" unit="cm²/Vs" step={1} value={pModel.U0} onChange={(x) => { set("U0", x); set("models", { P: { ...pModel, U0: x }, N: nModel }); }} />
            <Num label="NMOS Vth (VT0)" unit="V" value={nModel.VT0} onChange={(x) => set("models", { P: pModel, N: { ...nModel, VT0: x } })} />
            <Num label="NMOS 이동도 (U0)" unit="cm²/Vs" step={1} value={nModel.U0} onChange={(x) => set("models", { P: pModel, N: { ...nModel, U0: x } })} />
            <Num label="FLM 앞당김" unit="µs" value={c.flm_lead_us ?? 0} onChange={(x) => set("flm_lead_us", x)} />
            <Num label="FLM 늘림" unit="µs" value={c.flm_lag_us ?? 0} onChange={(x) => set("flm_lag_us", x)} />
            <Num label="홀드 허용 처짐" unit="V" value={c.hold_drop ?? 1} onChange={(x) => set("hold_drop", x)} />
          </div>

          <div style={{ marginTop: 12, padding: 10, background: "var(--lane)", borderRadius: 8, border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              <b>⚡ 외부 PCB 클럭 공급 옵션 (External PCB Clock Source for CLK1/CLK2)</b>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={!!c.external_pcb_clock}
                  onChange={(e) => set("external_pcb_clock", e.target.checked)}
                />
                외부 PCB 드라이버 활성화
              </label>
            </div>
            {c.external_pcb_clock && (
              <div className="grid4" style={{ marginTop: 8 }}>
                <Num label="외부 High (VGH)" unit="V" value={c.ext_vhigh ?? c.VGH} onChange={(x) => set("ext_vhigh", x)} />
                <Num label="외부 Low (VGL)" unit="V" value={c.ext_vlow ?? c.VGL} onChange={(x) => set("ext_vlow", x)} />
                <Num label="슬루율 (Tr/Tf)" unit="ns" step={5} value={c.ext_slew_ns ?? 20} onChange={(x) => set("ext_slew_ns", x)} />
                <Num label="PCB 소스 저항" unit="Ω" step={5} value={c.ext_rs_ohm ?? 15} onChange={(x) => set("ext_rs_ohm", x)} />
              </div>
            )}
          </div>

          <div style={{ marginTop: 12, padding: 10, background: "var(--lane)", borderRadius: 8, border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              <b>🧩 임의의(Custom) TFT 모델 추가 및 파일 불러오기</b>
              <div>
                <button type="button" className="ghost" style={{ fontSize: "0.8rem", padding: "4px 8px" }} onClick={() => modelFileInputRef.current?.click()}>
                  📂 외부 TFT 모델 파일(.mod/.json) 불러오기
                </button>
                <input ref={modelFileInputRef} type="file" accept=".mod,.sp,.cir,.json,.txt" style={{ display: "none" }} onChange={handleImportModelFile} />
              </div>
            </div>
            <div className="grid4">
              <label className="num"><span>모델 이름</span><input type="text" value={newModelName} onChange={(e) => setNewModelName(e.target.value)} /></label>
              <label className="num"><span>극성 (PMOS/NMOS)</span>
                <select value={newModelType} onChange={(e) => setNewModelType(e.target.value as "P" | "N")}>
                  <option value="P">PMOS (P형)</option>
                  <option value="N">NMOS (N형)</option>
                </select>
              </label>
              <Num label="|Vth| VT0" unit="V" value={newModelVt0} onChange={setNewModelVt0} />
              <Num label="이동도 U0" unit="cm²/Vs" step={1} value={newModelU0} onChange={setNewModelU0} />
              <Num label="SS" unit="V/dec" step={0.02} value={newModelSs} onChange={setNewModelSs} />
              <Num label="GOFF" unit="A" step={1e-13} value={newModelGoff} onChange={setNewModelGoff} />
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button type="button" onClick={addCustomModel}>+ 커스텀 모델 등록</button>
              </div>
            </div>
            {!!(c.custom_models && c.custom_models.length > 0) && (
              <div style={{ marginTop: 8, fontSize: "0.82rem" }}>
                등록된 커스텀 모델:{" "}
                {c.custom_models.map((m, i) => (
                  <span key={m.name} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--card)", border: "1px solid var(--line)", padding: "2px 8px", borderRadius: 4, marginRight: 6 }}>
                    <b>{m.name}</b> ({m.type}, VT0={m.VT0}V, U0={m.U0})
                    <button type="button" className="ghost" style={{ padding: "0 4px", color: "var(--bad)" }}
                      onClick={() => setC({ ...c, custom_models: (c.custom_models ?? []).filter((_, j) => j !== i) })}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </details>
      </section>

      <section className="card">
        <div className="row wrapline" style={{ justifyContent: "space-between" }}>
          <h2>TFT ({names.length}개) — PMOS/NMOS · 커스텀 모델 · BML 백게이트 지원</h2>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="ghost" onClick={addTft} disabled={names.length >= 16}>+ TFT 추가</button>
            <button type="button" className="primary" onClick={() => setShowAutoDrawing(true)}>
              🎨 Drawing (1단 회로도 자동 그리기)
            </button>
          </div>
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>TFT</th>
                <th>형(P/N)</th>
                <th>모델</th>
                <th>G</th>
                <th>S</th>
                <th>D</th>
                <th>W µm</th>
                <th>L µm</th>
                <th>BML 사용</th>
                <th>BML 연결 노드</th>
                <th>ΔVth V</th>
                <th>Ion ×</th>
                <th>Ioff ×</th>
                <th>SS ×</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {names.map((n) => {
                const p = c.tft[n];
                const tType = p.type ?? "P";
                return (
                  <tr key={n}>
                    <td><b>{n}</b></td>
                    <td>
                      <select value={tType} onChange={(e) => setTft(n, { type: e.target.value as "P" | "N" })}>
                        <option value="P">PMOS (P)</option>
                        <option value="N">NMOS (N)</option>
                      </select>
                    </td>
                    <td>
                      <select value={p.model_name ?? ""} onChange={(e) => setTft(n, { model_name: e.target.value || undefined })}>
                        <option value="">기본 ({tType})</option>
                        {(c.custom_models ?? []).map((cm) => (
                          <option key={cm.name} value={cm.name}>{cm.name} ({cm.type})</option>
                        ))}
                      </select>
                    </td>
                    {(["G", "S", "D"] as const).map((pin) => (
                      <td key={pin}><NetSelect value={p[pin]} nets={PIN_NETS} onChange={(x) => setTft(n, { [pin]: x })} /></td>
                    ))}
                    <td><input type="number" step={0.5} value={p.W} onChange={(e) => setTft(n, { W: parseFloat(e.target.value) })} /></td>
                    <td><input type="number" step={0.5} value={p.L} onChange={(e) => setTft(n, { L: parseFloat(e.target.value) })} /></td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={!!p.bml}
                        onChange={(e) => setTft(n, { bml: e.target.checked, bml_node: p.bml_node || "VGH" })}
                        title="BML (Bottom Metal Layer) 백게이트 전극 유무 선택 (기본: 미사용)"
                      />
                    </td>
                    <td>
                      {p.bml ? (
                        <NetSelect
                          value={p.bml_node ?? "VGH"}
                          nets={PIN_NETS}
                          onChange={(x) => setTft(n, { bml_node: x })}
                        />
                      ) : (
                        <span className="hint">—</span>
                      )}
                    </td>
                    <td><input type="number" step={0.05} className={p.dVT ? "aged" : ""} value={p.dVT ?? 0} onChange={(e) => setTft(n, { dVT: parseFloat(e.target.value) })} /></td>
                    <td><input type="number" step={0.05} className={(p.mu ?? 1) !== 1 ? "aged" : ""} value={p.mu ?? 1} onChange={(e) => setTft(n, { mu: parseFloat(e.target.value) })} /></td>
                    <td><input type="number" step={1} className={(p.ioff ?? 1) !== 1 ? "aged" : ""} value={p.ioff ?? 1} onChange={(e) => setTft(n, { ioff: parseFloat(e.target.value) })} /></td>
                    <td><input type="number" step={0.05} className={(p.ss ?? 1) !== 1 ? "aged" : ""} value={p.ss ?? 1} onChange={(e) => setTft(n, { ss: parseFloat(e.target.value) })} /></td>
                    <td><button className="ghost" onClick={() => delTft(n)}>삭제</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint">IN = 전단 출력(1단은 FLM), OUT = 이 단 출력, A·B·C·D·E·Q·QB = 단 내부 노드. BML 체크 시 선택한 노드의 전압 변화가 백게이트 Vth 결합(γ=0.15)으로 ngspice에 반영됩니다.</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, marginTop: 12 }}>
          <div>
            <h2>커패시터 ({c.caps.length}개)</h2>
            <div className="scroll">
              <table>
                <thead><tr><th>#</th><th>노드 1</th><th>노드 2</th><th>pF</th><th></th></tr></thead>
                <tbody>
                  {c.caps.map((cp, i) => (
                    <tr key={i}>
                      <td>C{i + 1}</td>
                      <td><NetSelect value={cp.a} nets={CAP_NETS} onChange={(x) => set("caps", c.caps.map((q, j) => j === i ? { ...q, a: x } : q))} /></td>
                      <td><NetSelect value={cp.b} nets={CAP_NETS} onChange={(x) => set("caps", c.caps.map((q, j) => j === i ? { ...q, b: x } : q))} /></td>
                      <td><input type="number" step={0.05} value={cp.pF} onChange={(e) => set("caps", c.caps.map((q, j) => j === i ? { ...q, pF: parseFloat(e.target.value) } : q))} /></td>
                      <td><button className="ghost" onClick={() => set("caps", c.caps.filter((_, j) => j !== i))}>삭제</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="ghost" onClick={() => set("caps", [...c.caps, { a: "Q", b: "OUT", pF: 0.2 }])}>+ 커패시터(Cap) 추가</button>
          </div>

          <div>
            <h2>다이오드 ({(c.diodes ?? []).length}개)</h2>
            <div className="scroll">
              <table>
                <thead><tr><th>이름</th><th>애노드(A)</th><th>캐소드(K)</th><th>IS (A)</th><th>N</th><th></th></tr></thead>
                <tbody>
                  {(c.diodes ?? []).map((d, i) => (
                    <tr key={i}>
                      <td><input type="text" value={d.name} style={{ width: 54 }} onChange={(e) => updateDiode(i, { name: e.target.value })} /></td>
                      <td><NetSelect value={d.a} nets={PIN_NETS} onChange={(x) => updateDiode(i, { a: x })} /></td>
                      <td><NetSelect value={d.k} nets={PIN_NETS} onChange={(x) => updateDiode(i, { k: x })} /></td>
                      <td><input type="number" step="any" value={d.IS ?? 1e-14} style={{ width: 80 }} onChange={(e) => updateDiode(i, { IS: parseFloat(e.target.value) })} /></td>
                      <td><input type="number" step={0.1} value={d.N ?? 1.5} style={{ width: 56 }} onChange={(e) => updateDiode(i, { N: parseFloat(e.target.value) })} /></td>
                      <td><button className="ghost" onClick={() => removeDiode(i)}>삭제</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="ghost" onClick={addDiode}>+ 다이오드(Diode) 추가</button>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="row wrapline" style={{ justifyContent: "space-between" }}>
          <h2>회로도 (1단)</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className={showAutoDrawing ? "primary" : "ghost"}
              onClick={() => setShowAutoDrawing(true)}
            >
              🎨 Drawing (테이블 기반 1단 자동 배선도)
            </button>
            {sameTopo && (
              <button
                type="button"
                className={!showAutoDrawing ? "primary" : "ghost"}
                onClick={() => setShowAutoDrawing(false)}
              >
                📐 프리셋 고정 도면 보기
              </button>
            )}
          </div>
        </div>

        {showAutoDrawing ? (
          <AutoStageDiagram
            kind="driver"
            title={`${c.name ?? "게이트 드라이버"} — 1단 자동 배선 회로도 (Drawing)`}
            tfts={names.map((n) => ({ name: n, type: c.tft[n].type ?? "P", ...c.tft[n] }))}
            caps={c.caps.map((cp, i) => ({ name: `C${i + 1}`, a: cp.a, b: cp.b, value: `${cp.pF} pF` }))}
            diodes={(c.diodes ?? []).map((d, i) => ({ name: d.name || `D${i + 1}`, a: d.a, k: d.k, label: `N=${d.n ?? d.N ?? 1.5}` }))}
          />
        ) : sameTopo ? (
          <div className="scroll"><DriverDiagram k={presetKey} c={c} /></div>
        ) : null}

        <details style={{ marginTop: 10 }}>
          <summary>노드 태그 개별 소자 기호 보기</summary>
          <Schematic
            title="홀수 단 기준. 짝수 단은 CLK1↔CLK2가 바뀌고, IN에는 전단 OUT이 들어갑니다."
            tfts={names.map((n) => ({ name: n, type: c.tft[n].type ?? "P", ...c.tft[n] }))}
            caps={c.caps.map((cp, i) => ({ name: `C${i + 1}`, a: cp.a, b: cp.b, value: `${cp.pF} pF` }))}
            diodes={(c.diodes ?? []).map((d, i) => ({ name: d.name || `D${i + 1}`, a: d.a, k: d.k, label: `IS=${d.IS ?? 1e-14}, N=${d.N ?? 1.5}` }))}
          />
        </details>
      </section>

      {/* Simulation & Auto-Optimization Action Bar */}
      <div className="runbar" style={{ flexWrap: "wrap", gap: 8 }}>
        <button className="primary" onClick={run} disabled={busy || !!optBusy}>
          {busy ? "ngspice 시뮬레이션 중…" : "▶ ngspice 시뮬레이션 실행"}
        </button>
        <button
          type="button"
          onClick={() => runOptimizer("params", "Parameter Optimize")}
          disabled={busy || !!optBusy}
          style={{ background: "#eef6ff", borderColor: "#2563eb", color: "#1d4ed8", fontWeight: 600 }}
          title="아웃풋 펄스가 안 나오거나 부족할 때 TFT W/L 및 Cap 용량을 조정하여 최적값 탐색"
        >
          {optBusy === "Parameter Optimize" ? "⚡ Parameter 최적화 중…" : "⚡ Parameter Optimize (W/L · Cap)"}
        </button>
        <button
          type="button"
          onClick={() => runOptimizer("signals", "Signal Optimizer")}
          disabled={busy || !!optBusy}
          style={{ background: "#f0fdf4", borderColor: "#16a34a", color: "#15803d", fontWeight: 600 }}
          title="클럭 주파수, FLM 시작펄스 타이밍(lead/lag/폭), VGH/VGL 전압 레벨을 조절하여 출력 펄스 복구"
        >
          {optBusy === "Signal Optimizer" ? "⏱ Signal 최적화 중…" : "⏱ Signal Optimizer (타이밍 · 전압)"}
        </button>
        <button
          type="button"
          onClick={() => runOptimizer("timing", "Timing Optimizer")}
          disabled={busy || !!optBusy}
          style={{ background: "#fff7ed", borderColor: "#c2410c", color: "#c2410c", fontWeight: 600 }}
          title="클럭 듀티비(pw_frac), 단간 타이밍 오프셋, QB 노드 전하 유지 및 T2/T5 풀업 네트워크 턴오프 최적화"
        >
          {optBusy === "Timing Optimizer" ? "⏳ Timing 최적화 중…" : "⏱ Timing Optimizer (QB 안정성 · 듀티비)"}
        </button>
        <button
          type="button"
          onClick={() => runOptimizer("wizard", "Wizard")}
          disabled={busy || !!optBusy}
          style={{ background: "#faf5ff", borderColor: "#7c3aed", color: "#6d28d9", fontWeight: 600 }}
          title="회로 배선(G/S/D) 오류 교정 또는 누락된 TFT/Cap 소자를 자동 추가하여 아웃풋 신호 생성"
        >
          {optBusy === "Wizard" ? "🪄 Wizard 회로 교정 중…" : "🪄 Wizard (배선 교정 · TFT 자동 추가)"}
        </button>
        <button type="button" onClick={handleExportNetlistSp} title="현재 편집된 회로를 .sp 파일로 다운로드">📄 Export Netlist (.sp)</button>
        {netErr && <span className="err">{netErr}</span>}
      </div>

      {optLogs.length > 0 && (
        <section className="card" style={{ background: "var(--lane)", borderLeft: "4px solid var(--accent)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b>🔧 최근 자동 최적화 (Optimizer / Wizard) 수행 내역</b>
            <button className="ghost" style={{ padding: "2px 6px", fontSize: "0.78rem" }} onClick={() => setOptLogs([])}>닫기</button>
          </div>
          <ul style={{ margin: "6px 0 0", fontSize: "0.86rem" }}>
            {optLogs.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </section>
      )}

      {res && !res.ok && (
        <section className="card bad">
          <h2>실행 안 됨</h2>
          <ul>{res.errors?.map((e, i) => <li key={i}><pre>{e}</pre></li>)}</ul>
          {res.netlist && <details><summary>넷리스트</summary><pre className="net">{res.netlist}</pre></details>}
        </section>
      )}

      {res?.ok && v && (
        <>
          <section className={"card verdict " + (v.pass ? "good" : "bad")}>
            <h2>{v.pass ? "PASS — 단마다 펄스 1개, 순서·레벨 정상" : `FAIL — 문제 ${v.problems.length}건`}</h2>
            <p className="hint">작업 {res.job} · ngspice {res.elapsed_s}s · 기준: 프레임마다 OUT 펄스 정확히 1개, 단 순서대로, {v.output === "high_pulse"
              ? `High ≥ VGH−${c.hold_drop ?? 1} V, 쉬는 동안 ≤ ${c.out_low_req ?? -6} V, 폭 = 시작 펄스 ±1H`
              : `Low ≤ ${c.out_low_req ?? -6} V, 홀드 중 VGH−${c.hold_drop ?? 1} V 이상`}</p>
            {!!res.warnings?.length && <ul className="warn">{res.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
            {!v.pass && <ul>{v.problems.slice(0, 12).map((p, i) => <li key={i}>{p}</li>)}</ul>}
            <div className="scroll">
              <table className="small">
                <thead><tr><th>프레임</th><th>단</th><th>펄스</th><th>시작 µs</th><th>폭 µs</th><th>{v.output === "high_pulse" ? "High V" : "Low V"}</th><th>{v.output === "high_pulse" ? "쉬는 최고 V" : "홀드 최저 V"}</th><th></th></tr></thead>
                <tbody>
                  {v.stages.map((s) => (
                    <tr key={s.frame + "-" + s.stage} className={s.pass ? "" : "rowbad"}>
                      <td>{s.frame}</td><td>OUT{s.stage}</td><td>{s.pulses}</td>
                      <td>{s.t_first_us ?? "—"}</td><td>{s.width_us ?? "—"}</td><td>{s.active_V}</td><td>{s.rest_V}</td>
                      <td>{s.pass ? "✓" : "✗"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {res.analysis && (
            <section className="card" style={{ background: "var(--lane)", borderLeft: "4px solid var(--accent)" }}>
              <h2>📊 CMOS_GB / 구동 회로 신호 & 노드 안정성 분석</h2>
              <div className="grid4" style={{ marginTop: 10 }}>
                <div style={{ background: "var(--card)", padding: 10, borderRadius: 6, border: "1px solid var(--line)" }}>
                  <div className="hint">출력 OUT 상승 시간 (tr)</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--accent)" }}>{res.analysis.rise_time_us} µs</div>
                </div>
                <div style={{ background: "var(--card)", padding: 10, borderRadius: 6, border: "1px solid var(--line)" }}>
                  <div className="hint">출력 OUT 하강 시간 (tf)</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--accent)" }}>{res.analysis.fall_time_us} µs</div>
                </div>
                <div style={{ background: "var(--card)", padding: 10, borderRadius: 6, border: "1px solid var(--line)" }}>
                  <div className="hint">QB 노드 전압 범위</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{res.analysis.qb_stability.min_V}V ~ {res.analysis.qb_stability.max_V}V</div>
                </div>
                <div style={{ background: "var(--card)", padding: 10, borderRadius: 6, border: "1px solid var(--line)" }}>
                  <div className="hint">QB 노드 리플 / 안정성</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, color: res.analysis.qb_stability.stable ? "var(--good)" : "var(--bad)" }}>
                    ΔV {res.analysis.qb_stability.ripple_V}V ({res.analysis.qb_stability.stable ? "✓ 안정" : "⚠ 주의"})
                  </div>
                </div>
              </div>
              <p className="sub" style={{ marginTop: 8 }}>
                분석 결과: OUT 1단 로우 레벨 및 2단 이후 전파 상태를 검증했습니다. 펄스 왜곡이나 2단 이후 신호 누락이 발생할 경우 <b>Wizard</b>나 <b>Parameter Optimize</b>를 실행하여 W/L 및 T8 풀업 소자를 최적화할 수 있습니다.
              </p>
            </section>
          )}

          <section className="card">
            <div className="row wrapline">
              <h2>파형</h2>
              <label className="num"><span>내부 노드 볼 단</span>
                <select value={stage} onChange={(e) => setStage(+e.target.value)}>
                  {Array.from({ length: c.stages }, (_, i) => <option key={i} value={i + 1}>{i + 1}단</option>)}
                </select>
              </label>
            </div>
            <Waveforms key={res.job} t={res.series!.t_us} rows={rows}
              vmin={Math.floor(Math.min(res.rails!.VGL, -1))} vmax={Math.ceil(res.rails!.VGH + 1)} />
          </section>

          <section className="card">
            <div className="row wrapline">
              <h2>넷리스트</h2>
              <button className="ghost" onClick={() => setShowNet(!showNet)}>{showNet ? "접기" : "보기"}</button>
              <button className="ghost" onClick={handleExportNetlistSp}>Export Netlist (.sp)</button>
              <button className="ghost" onClick={() => {
                const b = new Blob([res.netlist ?? ""], { type: "text/plain" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(b); a.download = `gw_${res.job}.cir`; a.click();
              }}>.cir 내려받기</button>
            </div>
            {showNet && <pre className="net">{res.netlist}</pre>}
          </section>
        </>
      )}
      <AgingPanel kind="driver" desc={c}
        onApply={(deg, temp) => setC({ ...c, temp_C: temp, tft: Object.fromEntries(Object.entries(c.tft).map(([k, p]) => [k, { ...p, ...(deg[k] ?? {}) }])) })}
        onReset={() => setC({ ...c, tft: Object.fromEntries(Object.entries(c.tft).map(([k, p]) => [k, { ...p, dVT: 0, mu: 1, ioff: 1, ss: 1 } as Tft])) })} />
      <MarginMap kind="driver" desc={c} vgh0={c.VGH} vgl0={c.VGL} />
    </div>
  );
}
