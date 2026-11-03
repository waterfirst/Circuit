import { useEffect, useRef, useState } from "react";
import { API } from "./api";
import { AgingLawType, MapCell, MapJob } from "./types";

const ensureNeg = (v: number) => (isNaN(v) ? -10 : v === 0 ? 0 : -Math.abs(v));

// VGH x VGL grid for the fresh and the current (degraded) circuit side by side,
// with option to select Stretched Exponential vs Power Law or manually override specific TR dVth.
export default function MarginMap({ kind, desc, vgh0, vgl0 }: {
  kind: "driver" | "pixel" | "hpd"; desc: any; vgh0: number; vgl0: number;
}) {
  const [vgh, setVgh] = useState<[number, number, number]>([vgh0 - 2, vgh0 + 4, 4]);
  const [vgl, setVgl] = useState<[number, number, number]>([ensureNeg(vgl0 - 4), ensureNeg(vgl0 + 3.5), 5]);
  const [tol, setTol] = useState(5);
  const [tempC, setTempC] = useState(85);
  const [hours, setHours] = useState(3000);
  const [lawType, setLawType] = useState<AgingLawType>("stretched_exponential");

  // Manual specific TR dVth override option
  const [useManualDvt, setUseManualDvt] = useState(false);
  const [selectedTrs, setSelectedTrs] = useState<Record<string, boolean>>({ T1: true });
  const [manualDvtValues, setManualDvtValues] = useState<Record<string, number>>({ T1: 0.8 });

  const [job, setJob] = useState<MapJob | null>(null);
  const [err, setErr] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  const tftNames: string[] = desc?.tft ? Object.keys(desc.tft).sort((a, b) => +a.slice(1) - +b.slice(1)) : ["T1"];

  const toggleTr = (tr: string, checked: boolean) => {
    setSelectedTrs((prev) => ({ ...prev, [tr]: checked }));
    if (checked && manualDvtValues[tr] === undefined) {
      const currentDvt = desc?.tft?.[tr]?.dVT;
      setManualDvtValues((prev) => ({ ...prev, [tr]: currentDvt && currentDvt !== 0 ? currentDvt : 0.8 }));
    }
  };

  const setTrDvt = (tr: string, val: number) => {
    setManualDvtValues((prev) => ({ ...prev, [tr]: isNaN(val) ? 0 : val }));
  };

  const start = async () => {
    setErr(""); setJob(null);
    const activeManualDvt: Record<string, number> = {};
    if (useManualDvt) {
      for (const tr of tftNames) {
        if (selectedTrs[tr]) {
          activeManualDvt[tr] = Number(manualDvtValues[tr] ?? 0);
        }
      }
      if (Object.keys(activeManualDvt).length === 0) {
        setErr("특정 TR ΔVth 직접 입력 모드에서는 최소 1개 이상의 TR을 선택해 주세요.");
        return;
      }
    }

    try {
      const r = await fetch(API + "/map", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          desc,
          vgh,
          vgl: [ensureNeg(vgl[0]), ensureNeg(vgl[1]), vgl[2]],
          tol_pct: tol,
          temp_C: tempC,
          hours: hours,
          law_type: lawType,
          use_manual_dvt: useManualDvt,
          manual_dvt: activeManualDvt,
        }),
      });
      const j = await r.json();
      if (!j.ok) { setErr((j.errors ?? ["실패"]).join(" / ")); return; }
      timer.current = window.setInterval(async () => {
        const s: MapJob = await (await fetch(API + "/map/" + j.id)).json();
        setJob(s);
        if (s.state !== "running" && timer.current) { window.clearInterval(timer.current); timer.current = null; }
      }, 1500);
    } catch {
      setErr("서버 응답 없음");
    }
  };

  const cellView = (c: MapCell | null) => {
    if (!c) return { cls: "pend", txt: "…", tip: "계산 중" };
    if (!c.ok) return { cls: "err", txt: "E", tip: c.err ?? "오류" };
    if (kind === "pixel" || kind === "hpd") {
      const v = c.change_pct ?? 0;
      return { cls: c.pass ? "ok" : "ng", txt: `${v > 0 ? "+" : ""}${v.toFixed(1)}`, tip: `${c.I_em_nA?.toFixed(1)} nA (${v.toFixed(2)}%)` };
    }
    return { cls: c.pass ? "ok" : "ng", txt: c.pass ? "PASS" : "FAIL", tip: c.first || "PASS" };
  };

  const near = (arr: number[], v: number) => arr.reduce((b, x, i) => (Math.abs(x - v) < Math.abs(arr[b] - v) ? i : b), 0);

  const grid = (which: "fresh" | "aged") => job && (
    <div className="mapbox">
      <h3>
        {which === "fresh"
          ? "열화 전 (새 소자: ΔVth=0 V, 25 °C)"
          : `열화 후 (${job.aging_source ? job.aging_source : `${tempC} °C, ${hours}h`})`}
      </h3>
      <div className="scroll">
        <table className="map">
          <thead><tr><th>VGH \\ VGL</th>{job.vgl.map((v) => <th key={v}>{v}</th>)}</tr></thead>
          <tbody>
            {job.vgh.map((h, i) => (
              <tr key={h}><th>{h}</th>
                {job.vgl.map((l, j) => {
                  const v = cellView(job[which][i][j]);
                  const here = i === near(job.vgh, vgh0) && j === near(job.vgl, vgl0);
                  return <td key={l} className={`${v.cls} ${here ? "here" : ""}`} title={v.tip}>{v.txt}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <section className="card">
      <h2>VGH · VGL 열화 마진 맵 (ngspice 전수 비교 시뮬레이션)</h2>
      <p className="hint">
        {kind === "driver"
          ? "모든 VGH × VGL 전압 조합에 대해 열화 전(ΔVth=0)과 열화 후(열화 수식 또는 특정 TR ΔVth 직접 입력값 반영) 각각 전체 ngspice 시뮬레이션을 수행합니다."
          : `칸마다 발광 전류를 새 소자·기본 전압 기준과 비교합니다(±${tol}% 안이면 통과).`}
        {" "}VGL 입력 시 자동으로 음수(-)가 적용됩니다.
      </p>

      <div className="grid4">
        <label className="num"><span>VGH 시작~끝 (V)</span>
          <span className="pair"><input type="number" value={vgh[0]} onChange={(e) => setVgh([+e.target.value, vgh[1], vgh[2]])} />
            <input type="number" value={vgh[1]} onChange={(e) => setVgh([vgh[0], +e.target.value, vgh[2]])} /></span></label>
        <label className="num"><span>VGH 칸 수</span><input type="number" min={2} max={7} value={vgh[2]} onChange={(e) => setVgh([vgh[0], vgh[1], +e.target.value])} /></label>
        <label className="num"><span>VGL 시작~끝 (-자동)</span>
          <span className="pair">
            <input type="number" value={vgl[0]} onChange={(e) => setVgl([ensureNeg(parseFloat(e.target.value)), vgl[1], vgl[2]])} />
            <input type="number" value={vgl[1]} onChange={(e) => setVgl([vgl[0], ensureNeg(parseFloat(e.target.value)), vgl[2]])} />
          </span></label>
        <label className="num"><span>VGL 칸 수</span><input type="number" min={2} max={7} value={vgl[2]} onChange={(e) => setVgl([vgl[0], vgl[1], +e.target.value])} /></label>

        <label className="num">
          <span>열화 수식 선택</span>
          <select value={lawType} onChange={(e) => setLawType(e.target.value as AgingLawType)} disabled={useManualDvt}>
            <option value="stretched_exponential">Stretched Exponential</option>
            <option value="power_law">Power Law</option>
          </select>
        </label>
        <label className="num"><span>열화 시뮬레이션 온도</span><input type="number" value={tempC} onChange={(e) => setTempC(+e.target.value)} /><em>°C</em></label>
        <label className="num"><span>열화 구동 시간</span><input type="number" step={500} value={hours} onChange={(e) => setHours(+e.target.value)} disabled={useManualDvt} /><em>h</em></label>
        {(kind === "pixel" || kind === "hpd") && <label className="num"><span>전류 허용 변화</span><input type="number" value={tol} onChange={(e) => setTol(+e.target.value)} /><em>%</em></label>}
      </div>

      {/* Specific TR manual Vth shift option */}
      <div style={{ margin: "12px 0", padding: "12px 14px", background: "var(--lane)", borderRadius: 8, border: "1px solid var(--line)" }}>
        <label className="row" style={{ fontWeight: 600, cursor: "pointer", marginBottom: useManualDvt ? 10 : 0 }}>
          <input
            type="checkbox"
            checked={useManualDvt}
            onChange={(e) => setUseManualDvt(e.target.checked)}
          />
          <span>🎯 특정 TR 선택하여 Vth Shift (ΔVth) 직접 입력 후 열화 마진 시뮬레이션 실행</span>
        </label>

        {useManualDvt && (
          <div>
            <p className="hint" style={{ margin: "4px 0 10px" }}>
              체크된 TR에만 입력한 ΔVth (V) 시프트를 부여하고(나머지 TR은 ΔVth=0V), 이 값을 ngspice 넷리스트에 직접 넣어 VGH×VGL 마진 맵을 시뮬레이션합니다.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))", gap: 8 }}>
              {tftNames.map((tr) => {
                const checked = !!selectedTrs[tr];
                return (
                  <div
                    key={tr}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: checked ? "var(--card)" : "transparent",
                      border: checked ? "1px solid var(--accent)" : "1px solid var(--line)",
                    }}
                  >
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 600, minWidth: 48, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => toggleTr(tr, e.target.checked)}
                      />
                      <span>{tr}</span>
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      disabled={!checked}
                      value={manualDvtValues[tr] ?? 0.8}
                      onChange={(e) => setTrDvt(tr, parseFloat(e.target.value))}
                      style={{ width: 72, padding: "3px 6px", fontSize: "0.85rem" }}
                    />
                    <em style={{ fontSize: "0.78rem", color: "var(--muted)" }}>V</em>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="runbar">
        <button className="primary" onClick={start} disabled={job?.state === "running"}>
          {job?.state === "running"
            ? `계산 중 ${job.done}/${job.total}`
            : useManualDvt
              ? "선택 TR ΔVth 적용 마진 맵 시뮬레이션 실행"
              : `마진 맵 계산 (${lawType === "power_law" ? "Power Law" : "Stretched Exp."} 열화 전·후)`}
        </button>
        {err && <span className="err">{err}</span>}
        {job?.state === "error" && <span className="err">{job.error}</span>}
        {job?.state === "done" && (
          <span className="hint">
            ✓ 총 {job.total}회 ngspice 독립 시뮬레이션 완료 ({job.elapsed_s}s)
          </span>
        )}
      </div>

      {/* Margin Comparison Summary */}
      {job?.state === "done" && job.fresh_pass_count !== undefined && job.aged_pass_count !== undefined && (
        <div style={{ margin: "12px 0", padding: "10px 14px", background: "var(--lane)", borderRadius: 8, border: "1px solid var(--line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                📊 동작 마진 비교: 열화 전 {job.fresh_pass_count}/{job.total_cells_per_map} 칸 통과 ({Math.round(job.fresh_pass_count / job.total_cells_per_map! * 100)}%)
                {" → "}
                열화 후 {job.aged_pass_count}/{job.total_cells_per_map} 칸 통과 ({Math.round(job.aged_pass_count / job.total_cells_per_map! * 100)}%)
              </span>
              <p className="hint" style={{ margin: "4px 0 0" }}>
                {job.fresh_pass_count > job.aged_pass_count
                  ? `✓ 열화로 인해 동작 마진이 ${job.fresh_pass_count - job.aged_pass_count}칸 축소되었습니다. (소자 열화 정상 반영 확인)`
                  : job.fresh_pass_count === job.aged_pass_count
                    ? "열화 후에도 마진 영역이 유지되었습니다 (회로 마진이 충분히 넓음)."
                    : "열화 후 통과 칸 변화 없음"}
              </p>
            </div>
            {job.deg_info && Object.keys(job.deg_info).length > 0 && (
              <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                반영된 열화치:{" "}
                {Object.entries(job.deg_info).filter(([, deg]) => deg.dVT !== 0).slice(0, 6).map(([tr, deg]) => `${tr}(ΔVth ${deg.dVT > 0 ? "+" : ""}${deg.dVT}V)`).join(", ") || "모두 0V"}
              </div>
            )}
          </div>
        </div>
      )}

      {job && <div className="maps">{grid("fresh")}{grid("aged")}</div>}
    </section>
  );
}
