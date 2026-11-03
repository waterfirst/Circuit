import { useEffect, useMemo, useRef, useState } from "react";
import AgingPanel from "./AgingPanel";
import MarginMap from "./MarginMap";
import PixelDiagram from "./PixelDiagram";
import Schematic from "./Schematic";
import Waveforms from "./Waveforms";
import { PIXEL_NETS, PIXEL_SIGS, PixelCircuit, PixelResult, PixelTft } from "./types";
import {
  getSavedPixelCircuits,
  savePixelCircuit,
  deletePixelCircuit,
  downloadJsonFile,
  downloadSpiceFile,
  SavedPixelCircuit,
} from "./storage";

import { API } from "./api";

function Num({ label, value, onChange, step = 0.1, unit }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; unit?: string;
}) {
  return (
    <label className="num">
      <span>{label}</span>
      <input type="number" step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      {unit && <em>{unit}</em>}
    </label>
  );
}

const SIG_NOTE: Record<string, string> = {
  GI: "T4 게이트 초기화 (N형, High=켜짐)", GC: "T3 Vth 보상 (N형, High=켜짐)",
  GW: "T2 데이터 쓰기 (P형, Low=켜짐)", EM: "T5·T6 발광 끔 구간 (High=꺼짐)",
  GO: "T7 애노드 초기화 · T8 온바이어스 (P형, Low=켜짐)",
};

export default function PixelPage() {
  const [preset, setPreset] = useState<PixelCircuit | null>(null);
  const [c, setC] = useState<PixelCircuit | null>(null);
  const [res, setRes] = useState<PixelResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showNet, setShowNet] = useState(false);

  // Local Storage for Pixel Configs
  const [savedPixels, setSavedPixels] = useState<SavedPixelCircuit[]>([]);
  const [savePixelName, setSavePixelName] = useState<string>("");
  const [selectedSavedPixelId, setSelectedSavedPixelId] = useState<string>("");
  const [pixelNotice, setPixelNotice] = useState<string | null>(null);
  const pixelFileInputRef = useRef<HTMLInputElement>(null);

  const loadSavedPixelList = () => {
    const list = getSavedPixelCircuits();
    setSavedPixels(list);
    if (list.length > 0 && !selectedSavedPixelId) {
      setSelectedSavedPixelId(list[0].id);
    }
  };

  useEffect(() => {
    loadSavedPixelList();
  }, []);

  const showPixelNotice = (msg: string) => {
    setPixelNotice(msg);
    setTimeout(() => setPixelNotice(null), 3500);
  };

  const handleSavePixel = () => {
    if (!c) return;
    const name = savePixelName.trim() || c.name || `내 화소_${new Date().toLocaleTimeString()}`;
    const saved = savePixelCircuit(name, { ...c, name });
    loadSavedPixelList();
    setSelectedSavedPixelId(saved.id);
    showPixelNotice(`✓ "${name}" 화소 설정이 로컬 스토리지에 JSON 형태로 저장되었습니다.`);
  };

  const handleLoadPixel = () => {
    const item = savedPixels.find((x) => x.id === selectedSavedPixelId);
    if (!item) {
      showPixelNotice("⚠ 불러올 저장 항목을 선택해주세요.");
      return;
    }
    setC(structuredClone(item.circuit));
    setSavePixelName(item.name);
    setRes(null);
    showPixelNotice(`✓ "${item.name}" 화소 설정을 로컬 스토리지에서 불러왔습니다.`);
  };

  const handleDeletePixel = () => {
    const item = savedPixels.find((x) => x.id === selectedSavedPixelId);
    if (!item) return;
    deletePixelCircuit(item.id);
    const updated = getSavedPixelCircuits();
    setSavedPixels(updated);
    setSelectedSavedPixelId(updated[0]?.id || "");
    showPixelNotice(`✓ "${item.name}" 화소 설정이 로컬 스토리지에서 삭제되었습니다.`);
  };

  const handleExportPixelJson = () => {
    if (!c) return;
    const name = (savePixelName.trim() || c.name || "pixel_circuit").replace(/\s+/g, "_");
    downloadJsonFile(`${name}.json`, c);
    showPixelNotice("✓ 화소 설정이 JSON 파일로 다운로드되었습니다.");
  };

  const handleExportNetlistSp = async () => {
    if (!c) return;
    const filename = (c.name || savePixelName || "pixel_8t1c").replace(/\s+/g, "_");
    if (res?.netlist) {
      downloadSpiceFile(filename, res.netlist);
      showPixelNotice(`✓ "${filename}.sp" 넷리스트 파일이 다운로드되었습니다.`);
      return;
    }
    try {
      const resp = await fetch(API + "/netlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "pixel", desc: c }),
      });
      const data = await resp.json();
      if (data.ok && data.netlist) {
        downloadSpiceFile(filename, data.netlist);
        showPixelNotice(`✓ "${filename}.sp" 넷리스트 파일이 다운로드되었습니다.`);
      } else {
        showPixelNotice("⚠ 넷리스트 생성 실패: " + (data.errors || []).join(", "));
      }
    } catch (err: any) {
      showPixelNotice("⚠ 넷리스트 생성 오류: " + err.message);
    }
  };

  const handleImportPixelJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (parsed && parsed.tft && parsed.timing_us) {
          const name = parsed.name || file.name.replace(/\.[^/.]+$/, "");
          parsed.name = name;
          setC(parsed);
          setSavePixelName(name);
          const saved = savePixelCircuit(name, parsed);
          loadSavedPixelList();
          setSelectedSavedPixelId(saved.id);
          setRes(null);
          showPixelNotice(`✓ "${name}" 화소 설정을 가져와 로컬 스토리지에 저장했습니다.`);
        } else {
          showPixelNotice("⚠ 올바른 화소 회로 JSON 형식이 아닙니다 (tft, timing_us 필드 필요).");
        }
      } catch (err: any) {
        showPixelNotice(`⚠ JSON 파싱 오류: ${err.message}`);
      }
      if (pixelFileInputRef.current) pixelFileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    fetch(API + "/pixel/preset").then((r) => r.json()).then((p) => { setPreset(p); setC(structuredClone(p)); })
      .catch(() => setErr("시뮬레이션 서버에 연결할 수 없어요. 서버(신노트북)가 꺼져 있거나 공개 연결이 아직 열리지 않았습니다. 잠시 후 새로고침해 보세요."));
  }, []);

  const set = <K extends keyof PixelCircuit>(k: K, v: PixelCircuit[K]) => c && setC({ ...c, [k]: v });
  const setTft = (n: string, p: Partial<PixelTft>) => c && setC({ ...c, tft: { ...c.tft, [n]: { ...c.tft[n], ...p } } });
  const setTm = (s: string, i: 0 | 1, v: number) => {
    if (!c) return;
    const cur = [...c.timing_us[s]] as [number, number];
    cur[i] = v;
    setC({ ...c, timing_us: { ...c.timing_us, [s]: cur } });
  };

  const run = async () => {
    if (!c) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch(API + "/pixel/simulate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c),
      });
      setRes(await r.json());
    } catch {
      setErr("요청 실패: 서버 응답 없음");
    } finally {
      setBusy(false);
    }
  };

  const sameTopo = useMemo(() => {
    if (!c || !preset) return false;
    const a = Object.keys(c.tft).sort(), b = Object.keys(preset.tft).sort();
    if (a.join() !== b.join()) return false;
    return a.every((k) => (["type", "G", "S", "D"] as const).every((p) => c.tft[k][p] === preset.tft[k][p]));
  }, [c, preset]);

  const rows = useMemo(() => {
    if (!res?.series || !c) return [];
    const s = res.series;
    const sig = PIXEL_SIGS.map((k) => ({ key: k, label: k, data: s[`v(${k})`] }));
    const nodes = ["G", "S", "D", "AN"].map((k) => ({
      key: "N" + k, label: k, data: s[`v(${k})`], range: [-5, 8] as [number, number],
    }));
    const i = s["I_OLED_nA"];
    const imax = Math.max(1, ...i);
    return [...sig, ...nodes, { key: "I_OLED", label: "I nA", data: i, range: [0, Math.ceil(imax * 1.1)] as [number, number] }];
  }, [res, c]);

  if (!c) return err ? <section className="card bad"><h2>연결 안 됨</h2><p>{err}</p></section> : <p>불러오는 중…</p>;
  const names = Object.keys(c.tft).sort((a, b) => +a.slice(1) - +b.slice(1));

  return (
    <div>
      {pixelNotice && (
        <div style={{ marginBottom: 12, padding: "8px 12px", background: "var(--good-bg)", color: "var(--good)", border: "1px solid var(--good)", borderRadius: 6, fontSize: "0.85rem" }}>
          {pixelNotice}
        </div>
      )}

      {/* LocalStorage Pixel Circuit Persistence Toolbar */}
      <section className="card" style={{ background: "var(--lane)", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: "0.9rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <span>💾</span> 내 화소 설정 로컬 저장소 (LocalStorage JSON)
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="ghost"
              style={{ fontSize: "0.8rem", padding: "4px 8px", color: "var(--accent)", fontWeight: 600 }}
              onClick={handleExportNetlistSp}
              title="현재 화소 넷리스트를 .sp 파일로 다운로드"
            >
              📄 Export Netlist (.sp)
            </button>
            <button
              type="button"
              className="ghost"
              style={{ fontSize: "0.8rem", padding: "4px 8px" }}
              onClick={handleExportPixelJson}
              title="현재 화소 설정을 JSON 파일로 다운로드"
            >
              ⬇ JSON 내보내기
            </button>
            <button
              type="button"
              className="ghost"
              style={{ fontSize: "0.8rem", padding: "4px 8px" }}
              onClick={() => pixelFileInputRef.current?.click()}
              title="화소 설정 JSON 파일 업로드"
            >
              ⬆ JSON 가져오기
            </button>
            <input
              ref={pixelFileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={handleImportPixelJson}
            />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="저장할 화소 이름 입력..."
            value={savePixelName}
            onChange={(e) => setSavePixelName(e.target.value)}
            style={{ padding: "6px 10px", fontSize: "0.88rem", minWidth: 200, flex: 1 }}
          />
          <button
            type="button"
            className="primary"
            onClick={handleSavePixel}
            style={{ padding: "6px 12px", fontSize: "0.88rem" }}
          >
            💾 내 화소 저장
          </button>

          <span style={{ color: "var(--line)", margin: "0 4px" }}>|</span>

          <select
            value={selectedSavedPixelId}
            onChange={(e) => setSelectedSavedPixelId(e.target.value)}
            style={{ padding: "6px 10px", fontSize: "0.88rem", minWidth: 220 }}
            disabled={savedPixels.length === 0}
          >
            {savedPixels.length === 0 ? (
              <option value="">저장된 내 화소 없음 (0개)</option>
            ) : (
              savedPixels.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({new Date(item.updatedAt).toLocaleDateString()})
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            onClick={handleLoadPixel}
            disabled={savedPixels.length === 0}
            style={{ padding: "6px 10px", fontSize: "0.88rem" }}
          >
            📂 불러오기
          </button>
          <button
            type="button"
            className="ghost"
            onClick={handleDeletePixel}
            disabled={savedPixels.length === 0}
            style={{ padding: "6px 8px", fontSize: "0.88rem", color: "var(--bad)" }}
            title="선택된 화소 삭제"
          >
            🗑
          </button>
        </div>
      </section>

      <section className="card">
        <div className="row wrapline">
          <h2>{c.name ?? "8T1C 화소"}</h2>
          <button className="ghost" onClick={() => { if (preset) { setC(structuredClone(preset)); setRes(null); } }}>기본값으로</button>
        </div>
        <p className="hint">T1 구동(P) · T2 데이터 쓰기(P, GW) · T3 Vth 보상(산화물 N, GC) · T4 게이트 초기화(산화물 N, GI) · T5/T6 발광(P, EM) · T7 애노드 초기화(P, GO) · T8 온바이어스(P, GO).
          토폴로지 참고: US 11,056,060 B2, US 11,600,229 B2. 소자 값은 합성값이며 특정 제조사 회로가 아닙니다.</p>
        <div className="grid4">
          <Num label="DATA" unit="V" value={c.VDATA} onChange={(x) => set("VDATA", x)} />
          <Num label="ELVDD" unit="V" value={c.ELVDD} onChange={(x) => set("ELVDD", x)} />
          <Num label="ELVSS" unit="V" value={c.ELVSS} onChange={(x) => set("ELVSS", x)} />
          <Num label="VINT" unit="V" value={c.VINT} onChange={(x) => set("VINT", x)} />
          <Num label="VOBS (온바이어스)" unit="V" value={c.VOBS} onChange={(x) => set("VOBS", x)} />
          <Num label="스캔 VGH" unit="V" value={c.VGH} onChange={(x) => set("VGH", x)} />
          <Num label="스캔 VGL" unit="V" value={c.VGL} onChange={(x) => set("VGL", x)} />
          <Num label="프레임 주파수" unit="Hz" step={1} value={c.frame_hz} onChange={(x) => set("frame_hz", x)} />
          <Num label="Cst" unit="fF" step={10} value={c.Cst_fF} onChange={(x) => set("Cst_fF", x)} />
          <Num label="C_OLED" unit="fF" step={5} value={c.Coled_fF} onChange={(x) => set("Coled_fF", x)} />
          <Num label="P형 |Vth|" unit="V" value={c.models.P.VT0} onChange={(x) => set("models", { ...c.models, P: { ...c.models.P, VT0: x } })} />
          <Num label="온도" unit="°C" step={5} value={c.temp_C ?? 25} onChange={(x) => set("temp_C", x)} />
          <Num label="N형 Vth" unit="V" value={c.models.N.VT0} onChange={(x) => set("models", { ...c.models, N: { ...c.models.N, VT0: x } })} />
          <Num label="구동 TFT (T1) ΔVth 시프트" unit="V" step={0.1} value={c.tft.T1?.dVT ?? 0} onChange={(x) => setTft("T1", { dVT: x })} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0 6px", fontSize: "0.85rem" }}>
          <span style={{ color: "var(--muted)", fontWeight: 500 }}>T1 열화(ΔVth) 빠른 설정:</span>
          <button type="button" className="ghost" style={{ padding: "3px 8px", fontSize: "0.8rem" }} onClick={() => setTft("T1", { dVT: 0.0 })}>열화 전 (0.0 V)</button>
          <button type="button" className="ghost" style={{ padding: "3px 8px", fontSize: "0.8rem" }} onClick={() => setTft("T1", { dVT: 0.2 })}>경미 (+0.2 V)</button>
          <button type="button" className="ghost" style={{ padding: "3px 8px", fontSize: "0.8rem" }} onClick={() => setTft("T1", { dVT: 0.5 })}>중간 (+0.5 V)</button>
          <button type="button" className="ghost" style={{ padding: "3px 8px", fontSize: "0.8rem" }} onClick={() => setTft("T1", { dVT: 1.0 })}>심함 (+1.0 V)</button>
          <button type="button" className="ghost" style={{ padding: "3px 8px", fontSize: "0.8rem" }} onClick={() => setTft("T1", { dVT: -0.3 })}>역방향 (-0.3 V)</button>
        </div>
        <label className="row"><input type="checkbox" checked={c.vth_check} onChange={(e) => set("vth_check", e.target.checked)} />
          <span>T1 Vth ±0.2 V 보상 확인도 같이 돌리기 (3회 실행)</span></label>
      </section>

      <section className="card">
        <h2>회로도</h2>
        {sameTopo
          ? <div className="scroll"><div style={{ minWidth: 680 }}><PixelDiagram c={c} /></div><p className="hint">폰에서는 옆으로 밀어서 보세요.</p></div>
          : <p className="warn">연결을 바꿔서 기본 배선도 대신 노드 태그 회로도로 보여줍니다.</p>}
        <details open={!sameTopo}>
          <summary>노드 태그 회로도 (연결 그대로)</summary>
          <Schematic
            tfts={names.map((n) => ({ name: n, ...c.tft[n] }))}
            caps={[{ name: "Cst", a: "ELVDD", b: "G", value: `${c.Cst_fF} fF` }, { name: "Coled", a: "AN", b: "ELVSS", value: `${c.Coled_fF} fF` }]}
            diodes={[{ name: "OLED", a: "AN", k: "ELVSS", label: "IS 6e-26, N 3" }]}
          />
        </details>
      </section>

      <section className="card">
        <h2>구동 타이밍 (한 프레임 안, µs)</h2>
        <div className="scroll">
          <table>
            <thead><tr><th>신호</th><th>시작</th><th>끝</th><th>역할</th></tr></thead>
            <tbody>
              {PIXEL_SIGS.map((s) => (
                <tr key={s}>
                  <td><b>{s}</b></td>
                  <td><input type="number" step={1} value={c.timing_us[s][0]} onChange={(e) => setTm(s, 0, parseFloat(e.target.value))} /></td>
                  <td><input type="number" step={1} value={c.timing_us[s][1]} onChange={(e) => setTm(s, 1, parseFloat(e.target.value))} /></td>
                  <td className="hint">{SIG_NOTE[s]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">순서: EM 끔 → GI(게이트를 VINT로) → GC 켬, 그 안에서 GW로 데이터 쓰기·Vth 저장 → GO(애노드 리셋·온바이어스) → EM 켬(발광).</p>
      </section>

      <section className="card">
        <h2>TFT</h2>
        <div className="scroll">
          <table>
            <thead><tr><th>TFT</th><th>형</th><th>G</th><th>S</th><th>D</th><th>W µm</th><th>L µm</th><th>ΔVth V</th><th>Ion ×</th><th>Ioff ×</th><th>SS ×</th></tr></thead>
            <tbody>
              {names.map((n) => {
                const p = c.tft[n];
                return (
                  <tr key={n}>
                    <td><b>{n}</b></td>
                    <td><select value={p.type} onChange={(e) => setTft(n, { type: e.target.value as "P" | "N" })}><option>P</option><option>N</option></select></td>
                    {(["G", "S", "D"] as const).map((pin) => (
                      <td key={pin}><select value={p[pin]} onChange={(e) => setTft(n, { [pin]: e.target.value })}>
                        {PIXEL_NETS.map((x) => <option key={x}>{x}</option>)}</select></td>
                    ))}
                    <td><input type="number" step={0.5} value={p.W} onChange={(e) => setTft(n, { W: parseFloat(e.target.value) })} /></td>
                    <td><input type="number" step={0.5} value={p.L} onChange={(e) => setTft(n, { L: parseFloat(e.target.value) })} /></td>
                    <td><input type="number" step={0.05} className={p.dVT ? "aged" : ""} value={p.dVT ?? 0} onChange={(e) => setTft(n, { dVT: parseFloat(e.target.value) })} /></td>
                    <td><input type="number" step={0.05} className={(p.mu ?? 1) !== 1 ? "aged" : ""} value={p.mu ?? 1} onChange={(e) => setTft(n, { mu: parseFloat(e.target.value) })} /></td>
                    <td><input type="number" step={1} className={(p.ioff ?? 1) !== 1 ? "aged" : ""} value={p.ioff ?? 1} onChange={(e) => setTft(n, { ioff: parseFloat(e.target.value) })} /></td>
                    <td><input type="number" step={0.05} className={(p.ss ?? 1) !== 1 ? "aged" : ""} value={p.ss ?? 1} onChange={(e) => setTft(n, { ss: parseFloat(e.target.value) })} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="runbar">
        <button className="primary" onClick={run} disabled={busy}>{busy ? "시뮬레이션 중…" : "화소 시뮬레이션 실행"}</button>
        <button type="button" onClick={handleExportNetlistSp} title="현재 편집된 화소 회로를 .sp 파일로 다운로드">📄 Export Netlist (.sp)</button>
        {err && <span className="err">{err}</span>}
      </div>

      {res && !res.ok && (
        <section className="card bad"><h2>실행 안 됨</h2><ul>{res.errors?.map((e, i) => <li key={i}>{e}</li>)}</ul></section>
      )}

      {res?.ok && res.metrics && (
        <>
          <section className="card">
            <h2>결과</h2>
            <div className="stats">
              <div><span>발광 중 OLED 전류</span><b>{res.metrics.I_em_nA.toFixed(1)} nA</b></div>
              <div><span>프레임 평균 전류</span><b>{res.metrics.I_frame_nA.toFixed(1)} nA</b></div>
              <div><span>GC 끝난 직후 G</span><b>{res.metrics.Vg_after_GC_V.toFixed(3)} V</b></div>
              <div><span>발광 중 G 평균</span><b>{res.metrics.Vg_em_V.toFixed(3)} V</b></div>
            </div>

            {res.comparison && (
              <div className="card" style={{ background: "var(--lane)", border: "1px solid var(--line)", margin: "14px 0" }}>
                <h3 style={{ margin: "0 0 8px", fontSize: "1rem", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>⚖️</span> 열화 전후 동작 비교 (Fresh vs Aged Comparison)
                </h3>
                <p className="hint" style={{ margin: "0 0 10px" }}>
                  동일 화소 회로의 <b>열화 전 (새 소자: ΔVth = 0 V)</b> 과 <b>열화 후 (T1 ΔVth = {res.comparison.t1_dVT > 0 ? "+" : ""}{res.comparison.t1_dVT} V)</b> 의 동작을 직접 비교합니다.
                </p>
                <div className="scroll">
                  <table className="small" style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>비교 항목</th>
                        <th>열화 전 (Fresh: ΔVth=0V)</th>
                        <th>열화 후 (Aged: ΔVth={res.comparison.t1_dVT}V)</th>
                        <th>변화량 / 오차</th>
                        <th>8T1C 보상 평가</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><b>발광 중 OLED 전류</b></td>
                        <td>{res.comparison.fresh_I_em_nA.toFixed(1)} nA</td>
                        <td>{res.comparison.aged_I_em_nA.toFixed(1)} nA</td>
                        <td style={{ fontWeight: 600, color: Math.abs(res.comparison.I_change_pct) < 5 ? "var(--good)" : "var(--bad)" }}>
                          {res.comparison.I_change_pct > 0 ? "+" : ""}{res.comparison.I_change_pct.toFixed(2)} %
                        </td>
                        <td>
                          {res.comparison.compensated ? "✓ Vth 보상 정상 (<10%)" : "⚠ 보상 한계 초과"}
                        </td>
                      </tr>
                      <tr>
                        <td><b>GC 보상 직후 게이트 V(G)</b></td>
                        <td>{res.comparison.fresh_Vg_after_GC_V.toFixed(3)} V</td>
                        <td>{res.comparison.aged_Vg_after_GC_V.toFixed(3)} V</td>
                        <td style={{ fontWeight: 600 }}>
                          {res.comparison.vg_shift_V > 0 ? "+" : ""}{res.comparison.vg_shift_V.toFixed(3)} V (ΔVth 추종)
                        </td>
                        <td className="hint">
                          T1 Vth 변화량만큼 게이트 전압을 자동 시프트하여 발광 전류 보존
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {res.vth_check && (
              <>
                <h2>Vth 보상 확인 (T1 ΔVth)</h2>
                <div className="scroll">
                  <table className="small">
                    <thead><tr><th>T1 ΔVth</th><th>G (GC 직후)</th><th>발광 전류</th><th>변화</th></tr></thead>
                    <tbody>
                      {res.vth_check.map((r) => (
                        <tr key={r.dVT}><td>{r.dVT > 0 ? "+" : ""}{r.dVT} V</td><td>{r.Vg_after_GC_V?.toFixed(3)} V</td>
                          <td>{r.I_em_nA?.toFixed(1)} nA</td><td>{r.I_change_pct > 0 ? "+" : ""}{r.I_change_pct}%</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="hint">보상이 잘 되면 G가 ΔVth만큼 따라 움직이고 전류 변화는 작습니다.</p>
              </>
            )}
            <p className="hint">작업 {res.job} · {res.elapsed_s}s · 두 번째 프레임 기준</p>
          </section>
          <section className="card">
            <h2>파형 (한 프레임)</h2>
            <Waveforms key={res.job} t={res.series!.t_us} rows={rows} vmin={Math.floor(c.VGL)} vmax={Math.ceil(c.VGH)} />
          </section>
          <section className="card">
            <div className="row wrapline">
              <h2>넷리스트</h2>
              <button className="ghost" onClick={() => setShowNet(!showNet)}>{showNet ? "접기" : "보기"}</button>
              <button className="ghost" onClick={handleExportNetlistSp}>Export Netlist (.sp)</button>
            </div>
            {showNet && <pre className="net">{res.netlist}</pre>}
          </section>
        </>
      )}
      <AgingPanel kind="pixel" desc={c}
        onApply={(deg, temp) => setC({ ...c, temp_C: temp, tft: Object.fromEntries(Object.entries(c.tft).map(([k, q]) => [k, { ...q, ...(deg[k] ?? {}) }])) })}
        onReset={() => setC({ ...c, tft: Object.fromEntries(Object.entries(c.tft).map(([k, q]) => [k, { ...q, dVT: 0, mu: 1, ioff: 1, ss: 1 }])) })} />
      <MarginMap kind="pixel" desc={c} vgh0={c.VGH} vgl0={c.VGL} />
    </div>
  );
}
