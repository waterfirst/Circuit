import { useEffect, useMemo, useRef, useState } from "react";
import AgingPanel from "./AgingPanel";
import AutoStageDiagram from "./AutoStageDiagram";
import MarginMap from "./MarginMap";
import PixelDiagram from "./PixelDiagram";
import Schematic from "./Schematic";
import Waveforms from "./Waveforms";
import { CustomTftModel, DiodeSpec, PIXEL_NETS, PIXEL_SIGS, PixelCap, PixelCircuit, PixelResult, PixelTft } from "./types";
import {
  getSavedPixelCircuits,
  savePixelCircuit,
  deletePixelCircuit,
  downloadJsonFile,
  downloadSpiceFile,
  SavedPixelCircuit,
} from "./storage";

import { API } from "./api";

const ensureNeg = (v: number) => (isNaN(v) ? -7 : v === 0 ? 0 : -Math.abs(v));

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
  GI: "T4 게이트 초기화 (N형, High=켜짐)",
  GC: "T3 Vth 보상 (N형, High=켜짐)",
  GW: "T2 데이터 쓰기 (P형, Low=켜짐)",
  EM: "T5·T6 발광 끔 구간 (High=꺼짐, 지우기/비발광)",
  GO: "T7 애노드 초기화 · T8 온바이어스 (P형, Low=켜짐)",
};

export default function PixelPage() {
  const [preset, setPreset] = useState<PixelCircuit | null>(null);
  const [c, setC] = useState<PixelCircuit | null>(null);
  const [res, setRes] = useState<PixelResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [optBusy, setOptBusy] = useState<string | null>(null);
  const [optLogs, setOptLogs] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [showNet, setShowNet] = useState(false);
  const [showAutoDrawing, setShowAutoDrawing] = useState(true);

  // Custom TFT Model addition state
  const [newModelName, setNewModelName] = useState("IGZO_HIGH_MOB");
  const [newModelType, setNewModelType] = useState<"P" | "N">("N");
  const [newModelVt0, setNewModelVt0] = useState(0.8);
  const [newModelU0, setNewModelU0] = useState(25);
  const [newModelSs, setNewModelSs] = useState(0.18);
  const [newModelGoff, setNewModelGoff] = useState(1e-14);
  const modelFileInputRef = useRef<HTMLInputElement>(null);

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
    setTimeout(() => setPixelNotice(null), 4000);
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
          if (parsed.VGL > 0) parsed.VGL = -Math.abs(parsed.VGL);
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
          showPixelNotice(`✓ ${valid.length}개 커스텀 TFT 모델을 불러왔습니다.`);
        } else {
          const mName = file.name.replace(/\.[^/.]+$/, "").replace(/\W+/g, "_").toUpperCase();
          const isN = /nmos|ntft|igzo|oxide/i.test(txt);
          const vtMatch = txt.match(/vt0\s*=\s*([+-]?[\d.eE+-]+)/i);
          const u0Match = txt.match(/u0\s*=\s*([+-]?[\d.eE+-]+)/i);
          const ssMatch = txt.match(/ss\s*=\s*([+-]?[\d.eE+-]+)/i);
          const newM: CustomTftModel = {
            name: mName || "IMPORTED_MOD",
            type: isN ? "N" : "P",
            VT0: vtMatch ? Math.abs(parseFloat(vtMatch[1])) : 1.0,
            U0: u0Match ? parseFloat(u0Match[1]) : 35,
            SS: ssMatch ? parseFloat(ssMatch[1]) : 0.25,
            GOFF: 1e-13,
          };
          setC({ ...c, custom_models: [...(c.custom_models ?? []), newM] });
          showPixelNotice(`✓ SPICE 모델 파일에서 "${newM.name}" (${newM.type}형) 모델을 불러왔습니다.`);
        }
      } catch (err: any) {
        showPixelNotice(`⚠ 모델 파일 파싱 실패: ${err.message}`);
      }
      if (modelFileInputRef.current) modelFileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    fetch(API + "/pixel/preset").then((r) => r.json()).then((p) => { setPreset(p); setC(structuredClone(p)); })
      .catch(() => setErr("시뮬레이션 서버에 연결할 수 없어요. 잠시 후 새로고침해 보세요."));
  }, []);

  const set = <K extends keyof PixelCircuit>(k: K, v: PixelCircuit[K]) => c && setC({ ...c, [k]: v });
  const setTft = (n: string, p: Partial<PixelTft>) => c && setC({ ...c, tft: { ...c.tft, [n]: { ...c.tft[n], ...p } } });
  const setTm = (s: string, i: 0 | 1, v: number) => {
    if (!c) return;
    const cur = [...c.timing_us[s]] as [number, number];
    cur[i] = v;
    setC({ ...c, timing_us: { ...c.timing_us, [s]: cur } });
  };

  const addTft = () => {
    if (!c) return;
    const free = Array.from({ length: 16 }, (_, i) => `T${i + 1}`).find((n) => !(n in c.tft));
    if (free) setTft(free, { type: "P", G: "GO", S: "VOBS", D: "S", W: 3, L: 3, dVT: 0, bml: false, bml_node: "ELVDD" });
  };
  const delTft = (name: string) => {
    if (!c) return;
    const { [name]: _, ...rest } = c.tft;
    setC({ ...c, tft: rest });
  };

  const addExtraCap = () => {
    if (!c) return;
    const list = c.extra_caps ?? [];
    setC({ ...c, extra_caps: [...list, { name: `Cboost${list.length + 1}`, a: "GW", b: "G", fF: 15 }] });
  };

  const updateExtraCap = (idx: number, patch: Partial<PixelCap>) => {
    if (!c) return;
    const list = [...(c.extra_caps ?? [])];
    list[idx] = { ...list[idx], ...patch };
    setC({ ...c, extra_caps: list });
  };

  const removeExtraCap = (idx: number) => {
    if (!c) return;
    setC({ ...c, extra_caps: (c.extra_caps ?? []).filter((_, j) => j !== idx) });
  };

  const addDiode = () => {
    if (!c) return;
    const list = c.diodes ?? [];
    setC({ ...c, diodes: [...list, { name: `D${list.length + 1}`, a: "AN", k: "VINT", IS: 1e-18, N: 2.0 }] });
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
    showPixelNotice(`✓ 커스텀 TFT 모델 "${cleanName}" (${newModelType}형)이 추가되었습니다.`);
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

  const runOptimizer = async (endpoint: "params" | "signals" | "wizard", label: string) => {
    if (!c) return;
    setOptBusy(label);
    setErr("");
    try {
      const r = await fetch(`${API}/optimize/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "pixel", desc: c }),
      });
      const j = await r.json();
      if (j.ok && j.best_desc) {
        setC(j.best_desc);
        if (j.sim) setRes(j.sim);
        setOptLogs(j.logs || []);
        setShowAutoDrawing(true);
        showPixelNotice(`✓ [${label}] 완료: ${(j.logs || []).join(" / ")}`);
      } else {
        setErr((j.errors || ["최적화 실패"]).join(", "));
      }
    } catch (e: any) {
      setErr(`최적화 요청 실패: ${e.message}`);
    } finally {
      setOptBusy(null);
    }
  };

  const sameTopo = useMemo(() => {
    if (!c || !preset) return false;
    if ((c.extra_caps ?? []).length > 0 || (c.diodes ?? []).length > 0) return false;
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

  const allCapsForDiagram = [
    { name: "Cst", a: "ELVDD", b: "G", value: `${c.Cst_fF} fF` },
    { name: "Coled", a: "AN", b: "ELVSS", value: `${c.Coled_fF} fF` },
    ...(c.extra_caps ?? []).map((cp, i) => ({ name: cp.name || `Cx${i + 1}`, a: cp.a, b: cp.b, value: `${cp.fF} fF` })),
  ];
  const allDiodesForDiagram = [
    { name: "OLED", a: "AN", k: "ELVSS", label: "IS=6e-26, N=3" },
    ...(c.diodes ?? []).map((d, i) => ({ name: d.name || `D${i + 1}`, a: d.a, k: d.k, label: `N=${d.N ?? 1.5}` })),
  ];

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
        <p className="hint">T1 구동(P) · T2 데이터 쓰기(P, GW) · T3 Vth 보상(산화물 N, GC) · T4 게이트 초기화(산화물 N, GI) · T5/T6 발광(P, EM) · T7 애노드 초기화(P, GO) · T8 온바이어스(P, GO).</p>
        <div className="grid4">
          <Num label="DATA" unit="V" value={c.VDATA} onChange={(x) => set("VDATA", x)} />
          <Num label="ELVDD" unit="V" value={c.ELVDD} onChange={(x) => set("ELVDD", x)} />
          <Num label="ELVSS" unit="V" value={c.ELVSS} onChange={(x) => set("ELVSS", x)} />
          <Num label="VINT" unit="V" value={c.VINT} onChange={(x) => set("VINT", x)} />
          <Num label="VOBS (온바이어스)" unit="V" value={c.VOBS} onChange={(x) => set("VOBS", x)} />
          <Num label="스캔 VGH" unit="V" value={c.VGH} onChange={(x) => set("VGH", x)} />
          <Num label="스캔 VGL (-자동입력)" unit="V" value={c.VGL} onChange={(x) => set("VGL", ensureNeg(x))} />
          <Num label="프레임 주파수" unit="Hz" step={1} value={c.frame_hz} onChange={(x) => set("frame_hz", x)} />
          <Num label="Cst" unit="fF" step={10} value={c.Cst_fF} onChange={(x) => set("Cst_fF", x)} />
          <Num label="C_OLED" unit="fF" step={5} value={c.Coled_fF} onChange={(x) => set("Coled_fF", x)} />
          <Num label="P형 |Vth|" unit="V" value={c.models.P.VT0} onChange={(x) => set("models", { ...c.models, P: { ...c.models.P, VT0: x } })} />
          <Num label="온도" unit="°C" step={5} value={c.temp_C ?? 25} onChange={(x) => set("temp_C", x)} />
          <Num label="N형 Vth" unit="V" value={c.models.N.VT0} onChange={(x) => set("models", { ...c.models, N: { ...c.models.N, VT0: x } })} />
          <Num label="구동 TFT (T1) ΔVth 시프트" unit="V" step={0.1} value={c.tft.T1?.dVT ?? 0} onChange={(x) => setTft("T1", { dVT: x })} />
        </div>

        <details style={{ marginTop: 10 }}>
          <summary>PMOS / NMOS 세부 모델 파라미터 & 임의(Custom) TFT 모델 불러오기</summary>
          <div className="grid4" style={{ marginTop: 8 }}>
            <Num label="P형 이동도 U0" unit="cm²/Vs" step={1} value={c.models.P.U0} onChange={(x) => set("models", { ...c.models, P: { ...c.models.P, U0: x } })} />
            <Num label="P형 SS" unit="V/dec" step={0.02} value={c.models.P.SS ?? 0.28} onChange={(x) => set("models", { ...c.models, P: { ...c.models.P, SS: x } })} />
            <Num label="N형 이동도 U0" unit="cm²/Vs" step={1} value={c.models.N.U0} onChange={(x) => set("models", { ...c.models, N: { ...c.models.N, U0: x } })} />
            <Num label="N형 SS" unit="V/dec" step={0.02} value={c.models.N.SS ?? 0.22} onChange={(x) => set("models", { ...c.models, N: { ...c.models.N, SS: x } })} />
          </div>
          <div style={{ marginTop: 10, padding: 10, background: "var(--lane)", borderRadius: 8, border: "1px solid var(--line)" }}>
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
        <div className="row wrapline" style={{ justifyContent: "space-between" }}>
          <h2>회로도 (1단 화소)</h2>
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
                📐 8T1C 프리셋 도면 보기
              </button>
            )}
          </div>
        </div>

        {showAutoDrawing ? (
          <AutoStageDiagram
            kind="pixel"
            title={`${c.name ?? "화소 회로"} — 1단 자동 배선 회로도 (Drawing)`}
            tfts={names.map((n) => ({ name: n, ...c.tft[n] }))}
            caps={allCapsForDiagram}
            diodes={allDiodesForDiagram}
          />
        ) : sameTopo ? (
          <div className="scroll"><div style={{ minWidth: 680 }}><PixelDiagram c={c} /></div><p className="hint">폰에서는 옆으로 밀어서 보세요.</p></div>
        ) : null}

        <details style={{ marginTop: 10 }}>
          <summary>노드 태그 개별 소자 기호 보기</summary>
          <Schematic
            tfts={names.map((n) => ({ name: n, ...c.tft[n] }))}
            caps={allCapsForDiagram}
            diodes={allDiodesForDiagram}
          />
        </details>
      </section>

      <section className="card">
        <div className="row wrapline" style={{ justifyContent: "space-between" }}>
          <h2>구동 타이밍 (한 프레임 안, µs) — 지우기 · 초기화 · Vth 보상 · 쓰기 · 발광</h2>
          <button
            type="button"
            onClick={() => runOptimizer("signals", "Signal Optimizer")}
            disabled={busy || !!optBusy}
            style={{ background: "#f0fdf4", borderColor: "#16a34a", color: "#15803d", fontWeight: 600 }}
          >
            {optBusy === "Signal Optimizer" ? "⏱ 타이밍 최적화 중…" : "⏱ Signal Optimizer (스탭별 타이밍 자동 정렬)"}
          </button>
        </div>
        <div className="scroll">
          <table>
            <thead><tr><th>신호</th><th>시작 (µs)</th><th>끝 (µs)</th><th>구동 스탭 및 역할</th></tr></thead>
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
        <p className="hint">순서: ① 지우기(EM High로 발광 차단) → ② 게이트 초기화(GI High로 G를 VINT로 리셋) → ③ Vth 보상 및 데이터 쓰기(GC High 동안 GW Low 인가하여 Vth 샘플링) → ④ 애노드 초기화·온바이어스(GO Low) → ⑤ 발광(EM Low 전환).</p>
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
                return (
                  <tr key={n}>
                    <td><b>{n}</b></td>
                    <td>
                      <select value={p.type} onChange={(e) => setTft(n, { type: e.target.value as "P" | "N" })}>
                        <option value="P">PMOS (P)</option>
                        <option value="N">NMOS (N)</option>
                      </select>
                    </td>
                    <td>
                      <select value={p.model_name ?? ""} onChange={(e) => setTft(n, { model_name: e.target.value || undefined })}>
                        <option value="">기본 ({p.type})</option>
                        {(c.custom_models ?? []).map((cm) => (
                          <option key={cm.name} value={cm.name}>{cm.name} ({cm.type})</option>
                        ))}
                      </select>
                    </td>
                    {(["G", "S", "D"] as const).map((pin) => (
                      <td key={pin}><select value={p[pin]} onChange={(e) => setTft(n, { [pin]: e.target.value })}>
                        {PIXEL_NETS.map((x) => <option key={x}>{x}</option>)}</select></td>
                    ))}
                    <td><input type="number" step={0.5} value={p.W} onChange={(e) => setTft(n, { W: parseFloat(e.target.value) })} /></td>
                    <td><input type="number" step={0.5} value={p.L} onChange={(e) => setTft(n, { L: parseFloat(e.target.value) })} /></td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={!!p.bml}
                        onChange={(e) => setTft(n, { bml: e.target.checked, bml_node: p.bml_node || "ELVDD" })}
                        title="BML (Bottom Metal Layer) 백게이트 전극 유무 선택 (기본: 미사용)"
                      />
                    </td>
                    <td>
                      {p.bml ? (
                        <select value={p.bml_node ?? "ELVDD"} onChange={(e) => setTft(n, { bml_node: e.target.value })}>
                          {PIXEL_NETS.map((x) => <option key={x}>{x}</option>)}
                        </select>
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, marginTop: 12 }}>
          <div>
            <h2>추가 커패시터 ({(c.extra_caps ?? []).length}개, 기본 Cst·Coled 외)</h2>
            <div className="scroll">
              <table>
                <thead><tr><th>이름</th><th>노드 1</th><th>노드 2</th><th>fF</th><th></th></tr></thead>
                <tbody>
                  {(c.extra_caps ?? []).map((cp, i) => (
                    <tr key={i}>
                      <td><input type="text" value={cp.name ?? `Cx${i + 1}`} style={{ width: 64 }} onChange={(e) => updateExtraCap(i, { name: e.target.value })} /></td>
                      <td><select value={cp.a} onChange={(e) => updateExtraCap(i, { a: e.target.value })}>{PIXEL_NETS.map((x) => <option key={x}>{x}</option>)}</select></td>
                      <td><select value={cp.b} onChange={(e) => updateExtraCap(i, { b: e.target.value })}>{PIXEL_NETS.map((x) => <option key={x}>{x}</option>)}</select></td>
                      <td><input type="number" step={5} value={cp.fF} style={{ width: 70 }} onChange={(e) => updateExtraCap(i, { fF: parseFloat(e.target.value) })} /></td>
                      <td><button className="ghost" onClick={() => removeExtraCap(i)}>삭제</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="ghost" onClick={addExtraCap}>+ 커패시터(Cap) 추가</button>
          </div>

          <div>
            <h2>추가 다이오드 ({(c.diodes ?? []).length}개, 기본 OLED 외)</h2>
            <div className="scroll">
              <table>
                <thead><tr><th>이름</th><th>애노드(A)</th><th>캐소드(K)</th><th>IS (A)</th><th>N</th><th></th></tr></thead>
                <tbody>
                  {(c.diodes ?? []).map((d, i) => (
                    <tr key={i}>
                      <td><input type="text" value={d.name} style={{ width: 54 }} onChange={(e) => updateDiode(i, { name: e.target.value })} /></td>
                      <td><select value={d.a} onChange={(e) => updateDiode(i, { a: e.target.value })}>{PIXEL_NETS.map((x) => <option key={x}>{x}</option>)}</select></td>
                      <td><select value={d.k} onChange={(e) => updateDiode(i, { k: e.target.value })}>{PIXEL_NETS.map((x) => <option key={x}>{x}</option>)}</select></td>
                      <td><input type="number" step="any" value={d.IS ?? 1e-18} style={{ width: 80 }} onChange={(e) => updateDiode(i, { IS: parseFloat(e.target.value) })} /></td>
                      <td><input type="number" step={0.1} value={d.N ?? 2.0} style={{ width: 56 }} onChange={(e) => updateDiode(i, { N: parseFloat(e.target.value) })} /></td>
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

      {/* Simulation & Auto-Optimization Action Bar */}
      <div className="runbar" style={{ flexWrap: "wrap", gap: 8 }}>
        <button className="primary" onClick={run} disabled={busy || !!optBusy}>
          {busy ? "ngspice 시뮬레이션 중…" : "▶ 화소 ngspice 시뮬레이션 실행"}
        </button>
        <button
          type="button"
          onClick={() => runOptimizer("params", "Parameter Optimize")}
          disabled={busy || !!optBusy}
          style={{ background: "#eef6ff", borderColor: "#2563eb", color: "#1d4ed8", fontWeight: 600 }}
          title="발광 전류나 Vth 보상이 부족할 때 TFT W/L 및 Cst 용량을 자동 조정하여 최적값 탐색"
        >
          {optBusy === "Parameter Optimize" ? "⚡ Parameter 최적화 중…" : "⚡ Parameter Optimize (W/L · Cap)"}
        </button>
        <button
          type="button"
          onClick={() => runOptimizer("signals", "Signal Optimizer")}
          disabled={busy || !!optBusy}
          style={{ background: "#f0fdf4", borderColor: "#16a34a", color: "#15803d", fontWeight: 600 }}
          title="지우기(EM) · 초기화(GI) · Vth 보상(GC) · 데이터 쓰기(GW) · 애노드 리셋(GO) · 발광 스탭에 맞게 타이밍 정렬"
        >
          {optBusy === "Signal Optimizer" ? "⏱ Signal 최적화 중…" : "⏱ Signal Optimizer (구동 스탭 타이밍)"}
        </button>
        <button
          type="button"
          onClick={() => runOptimizer("wizard", "Wizard")}
          disabled={busy || !!optBusy}
          style={{ background: "#faf5ff", borderColor: "#7c3aed", color: "#6d28d9", fontWeight: 600 }}
          title="화소 회로 연결을 교정하거나 누락된 TFT(T1~T8)를 복원하여 정상 발광 및 Vth 보상이 되도록 자동 수리"
        >
          {optBusy === "Wizard" ? "🪄 Wizard 회로 교정 중…" : "🪄 Wizard (배선 교정 · TFT 자동 추가)"}
        </button>
        <button type="button" onClick={handleExportNetlistSp} title="현재 편집된 화소 회로를 .sp 파일로 다운로드">📄 Export Netlist (.sp)</button>
        {err && <span className="err">{err}</span>}
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
