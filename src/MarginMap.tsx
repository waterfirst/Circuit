import { useEffect, useRef, useState } from "react";
import { API } from "./api";
import { MapCell, MapJob } from "./types";

// VGH x VGL grid for the fresh and the current (degraded) circuit side by side,
// so you can see whether moving the rails removes or worsens a failure.
export default function MarginMap({ kind, desc, vgh0, vgl0 }: {
  kind: "driver" | "pixel"; desc: object; vgh0: number; vgl0: number;
}) {
  const [vgh, setVgh] = useState<[number, number, number]>([vgh0 - 2, vgh0 + 4, 4]);
  const [vgl, setVgl] = useState<[number, number, number]>([vgl0 - 4, vgl0 + 3.5, 5]);
  const [tol, setTol] = useState(5);
  const [tempC, setTempC] = useState(85);
  const [hours, setHours] = useState(3000);
  const [job, setJob] = useState<MapJob | null>(null);
  const [err, setErr] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  const start = async () => {
    setErr(""); setJob(null);
    try {
      const r = await fetch(API + "/map", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          desc,
          vgh,
          vgl,
          tol_pct: tol,
          temp_C: tempC,
          hours: hours,
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
    if (kind === "pixel") {
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
          : `열화 후 (각 TR 열화 반영: ${job.aging_source ? job.aging_source : `${tempC} °C, ${hours}h`})`}
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
      <h2>VGH · VGL 마진 맵 (열화 전후 전수 비교 시뮬레이션)</h2>
      <p className="hint">
        {kind === "driver"
          ? "모든 VGH × VGL 전압 조합에 대해 열화 전(ΔVth=0)과 열화 후(각 TR별 스트레스 열화치 반영) 각각 전체 ngspice 시뮬레이션을 수행합니다."
          : `칸마다 발광 전류를 새 소자·기본 전압 기준과 비교합니다(±${tol}% 안이면 통과).`}
        굵은 테두리 = 지금 설정한 전압에 가장 가까운 칸.
      </p>

      <div className="grid4">
        <label className="num"><span>VGH 시작~끝</span>
          <span className="pair"><input type="number" value={vgh[0]} onChange={(e) => setVgh([+e.target.value, vgh[1], vgh[2]])} />
            <input type="number" value={vgh[1]} onChange={(e) => setVgh([vgh[0], +e.target.value, vgh[2]])} /></span></label>
        <label className="num"><span>VGH 칸 수</span><input type="number" min={2} max={7} value={vgh[2]} onChange={(e) => setVgh([vgh[0], vgh[1], +e.target.value])} /></label>
        <label className="num"><span>VGL 시작~끝</span>
          <span className="pair"><input type="number" value={vgl[0]} onChange={(e) => setVgl([+e.target.value, vgl[1], vgl[2]])} />
            <input type="number" value={vgl[1]} onChange={(e) => setVgl([vgl[0], +e.target.value, vgl[2]])} /></span></label>
        <label className="num"><span>VGL 칸 수</span><input type="number" min={2} max={7} value={vgl[2]} onChange={(e) => setVgl([vgl[0], vgl[1], +e.target.value])} /></label>
        <label className="num"><span>열화 시뮬레이션 온도</span><input type="number" value={tempC} onChange={(e) => setTempC(+e.target.value)} /><em>°C</em></label>
        <label className="num"><span>열화 구동 시간</span><input type="number" step={500} value={hours} onChange={(e) => setHours(+e.target.value)} /><em>h</em></label>
        {kind === "pixel" && <label className="num"><span>전류 허용 변화</span><input type="number" value={tol} onChange={(e) => setTol(+e.target.value)} /><em>%</em></label>}
      </div>

      <div className="runbar">
        <button className="primary" onClick={start} disabled={job?.state === "running"}>
          {job?.state === "running" ? `계산 중 ${job.done}/${job.total}` : "마진 맵 계산 (열화 전·후 전수 시뮬레이션)"}
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
                {Object.entries(job.deg_info).slice(0, 4).map(([tr, deg]) => `${tr}(ΔVth ${deg.dVT > 0 ? "+" : ""}${deg.dVT}V)`).join(", ")}
                {Object.keys(job.deg_info).length > 4 ? " 외" : ""}
              </div>
            )}
          </div>
        </div>
      )}

      {job && <div className="maps">{grid("fresh")}{grid("aged")}</div>}
    </section>
  );
}
