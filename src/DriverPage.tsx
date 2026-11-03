import { useEffect, useMemo, useRef, useState } from "react";
import AgingPanel from "./AgingPanel";
import DriverDiagram, { DIAGRAM_KEYS } from "./DriverDiagrams";
import MarginMap from "./MarginMap";
import Schematic from "./Schematic";
import Waveforms from "./Waveforms";
import { CAP_NETS, Circuit, Deg, PIN_NETS, SimResult, Tft } from "./types";
import {
  getSavedDriverCircuits,
  saveDriverCircuit,
  deleteDriverCircuit,
  downloadJsonFile,
  downloadSpiceFile,
  SavedDriverCircuit,
} from "./storage";

import { API } from "./api";

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
  const [netErr, setNetErr] = useState("");
  const [stage, setStage] = useState(1);
  const [showNet, setShowNet] = useState(false);
  const [presetKey, setPresetKey] = useState("8T");

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
    setTimeout(() => setCircuitNotice(null), 3500);
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

  useEffect(() => {
    fetch(API + "/presets").then((r) => r.json()).then((p) => {
      setPresets(p);
      setC(structuredClone(p["8T"]));
    }).catch(() => setNetErr("시뮬레이션 서버에 연결할 수 없어요. 서버(신노트북)가 꺼져 있거나 공개 연결이 아직 열리지 않았습니다. 잠시 후 새로고침해 보세요."));
  }, []);

  const set = <K extends keyof Circuit>(k: K, v: Circuit[K]) => c && setC({ ...c, [k]: v });
  const setTft = (name: string, patch: Partial<Tft>) =>
    c && setC({ ...c, tft: { ...c.tft, [name]: { ...c.tft[name], ...patch } } });

  const addTft = () => {
    if (!c) return;
    const free = Array.from({ length: 12 }, (_, i) => `T${i + 1}`).find((n) => !(n in c.tft));
    if (free) setTft(free, { G: "VGL", S: "VGH", D: "QB", W: 4, L: 4.5, dVT: 0 });
  };
  const delTft = (name: string) => {
    if (!c) return;
    const { [name]: _, ...rest } = c.tft;
    setC({ ...c, tft: rest });
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

  // the wired drawing is only true while connections equal the loaded preset
  const sameTopo = useMemo(() => {
    const p = presets[presetKey];
    if (!c || !p || !DIAGRAM_KEYS.has(presetKey)) return false;
    const a = Object.keys(c.tft).sort(), b = Object.keys(p.tft).sort();
    if (a.join() !== b.join() || c.caps.length !== p.caps.length) return false;
    return a.every((k) => (["G", "S", "D"] as const).every((x) => c.tft[k][x] === p.tft[k][x]))
      && c.caps.every((q, i) => q.a === p.caps[i].a && q.b === p.caps[i].b);
  }, [c, presets, presetKey]);

  if (!c) return netErr ? <section className="card bad"><h2>연결 안 됨</h2><p>{netErr}</p></section> : <p>불러오는 중…</p>;

  const names = Object.keys(c.tft).sort((a, b) => +a.slice(1) - +b.slice(1));
  const v = res?.verdict;

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
          <Num label="VGL" unit="V" value={c.VGL} onChange={(x) => set("VGL", x)} />
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
        <details>
          <summary>고급 설정</summary>
          <div className="grid4">
            <Num label="|Vth| VT0" unit="V" value={c.VT0 ?? 1.1} onChange={(x) => set("VT0", x)} />
            <Num label="이동도 U0" unit="cm²/Vs" step={1} value={c.U0 ?? 65} onChange={(x) => set("U0", x)} />
            <Num label="FLM 앞당김" unit="µs" value={c.flm_lead_us ?? 0} onChange={(x) => set("flm_lead_us", x)} />
            <Num label="FLM 늘림" unit="µs" value={c.flm_lag_us ?? 0} onChange={(x) => set("flm_lag_us", x)} />
            <Num label="홀드 허용 처짐" unit="V" value={c.hold_drop ?? 1} onChange={(x) => set("hold_drop", x)} />
          </div>
          <p className="hint">H = 1000 / 라인 주파수(µs). CLK 주기 = 2H, Low 폭 = 0.75H. 핀 이름은 홀수 단 기준이며 짝수 단은 CLK1↔CLK2가 자동으로 바뀝니다.</p>
        </details>
      </section>

      <section className="card">
        <h2>TFT ({names.length}개)</h2>
        <div className="scroll">
          <table>
            <thead><tr><th>TFT</th><th>G</th><th>S</th><th>D</th><th>W µm</th><th>L µm</th><th>ΔVth V</th><th>Ion ×</th><th>Ioff ×</th><th>SS ×</th><th></th></tr></thead>
            <tbody>
              {names.map((n) => {
                const p = c.tft[n];
                return (
                  <tr key={n}>
                    <td><b>{n}</b></td>
                    {(["G", "S", "D"] as const).map((pin) => (
                      <td key={pin}><NetSelect value={p[pin]} nets={PIN_NETS} onChange={(x) => setTft(n, { [pin]: x })} /></td>
                    ))}
                    <td><input type="number" step={0.5} value={p.W} onChange={(e) => setTft(n, { W: parseFloat(e.target.value) })} /></td>
                    <td><input type="number" step={0.5} value={p.L} onChange={(e) => setTft(n, { L: parseFloat(e.target.value) })} /></td>
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
        <button className="ghost" onClick={addTft} disabled={names.length >= 12}>+ TFT 추가</button>
        <p className="hint">IN = 전단 출력(1단은 FLM), OUT = 이 단 출력, A·B·C·D·E·Q·QB = 단 내부 노드.</p>

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
        <button className="ghost" onClick={() => set("caps", [...c.caps, { a: "Q", b: "OUT", pF: 0.2 }])}>+ 커패시터 추가</button>
      </section>

      <section className="card">
        <h2>회로도 (1단)</h2>
        {sameTopo
          ? <div className="scroll"><DriverDiagram k={presetKey} c={c} /></div>
          : <p className="warn">연결을 바꿨거나 배선도가 없는 회로라서 노드 태그 회로도로 보여줍니다.</p>}
        <details open={!sameTopo}>
        <summary>노드 태그 회로도 (연결 그대로)</summary>
        <Schematic
          title="홀수 단 기준. 짝수 단은 CLK1↔CLK2가 바뀌고, IN에는 전단 OUT이 들어갑니다."
          tfts={names.map((n) => ({ name: n, type: "P" as const, ...c.tft[n] }))}
          caps={c.caps.map((cp, i) => ({ name: `C${i + 1}`, a: cp.a, b: cp.b, value: `${cp.pF} pF` }))}
        />
        </details>
      </section>

      <div className="runbar">
        <button className="primary" onClick={run} disabled={busy}>{busy ? "시뮬레이션 중… (수 초)" : "시뮬레이션 실행"}</button>
        <button type="button" onClick={handleExportNetlistSp} title="현재 편집된 회로를 .sp 파일로 다운로드">📄 Export Netlist (.sp)</button>
        {netErr && <span className="err">{netErr}</span>}
      </div>

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
