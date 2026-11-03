import { useEffect, useMemo, useRef, useState } from "react";

const COLORS: Record<string, string> = {
  FLM: "#7c3aed", CLK1: "#0891b2", CLK2: "#0d9488",
};
const OUT_COLOR = "#dc2626";
const NODE_COLOR = "#2563eb";

interface Props {
  t: number[];
  rows: { key: string; label: string; data: number[]; range?: [number, number] }[];
  vmin: number;
  vmax: number;
}

// Stacked waveforms on one shared time axis. Drag horizontally to zoom,
// double-click to reset.
export default function Waveforms({ t, rows, vmin, vmax }: Props) {
  const full: [number, number] = [t[0] ?? 0, t[t.length - 1] ?? 1];
  const [range, setRange] = useState<[number, number]>(full);
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(1000);

  // draw in real CSS pixels so labels keep their size on phones
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(Math.max(300, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = boxW, narrow = W < 600;
  const LBL = narrow ? 52 : 70, ROW = narrow ? 34 : 46, GAP = 6, AX = 26;
  const H = rows.length * (ROW + GAP) + AX;
  const [t0, t1] = range[1] > range[0] ? range : full;
  const x = (v: number) => LBL + ((v - t0) / (t1 - t0)) * (W - LBL - 8);

  const paths = useMemo(() => {
    const idx: number[] = [];
    for (let i = 0; i < t.length; i++) if (t[i] >= t0 && t[i] <= t1) idx.push(i);
    const step = Math.max(1, Math.floor(idx.length / 1500));
    return rows.map((r, k) => {
      const top = k * (ROW + GAP);
      const [lo, hi] = r.range ?? [vmin, vmax];
      const y = (v: number) => top + ROW - ((v - lo) / (hi - lo || 1)) * ROW;
      let d = "";
      for (let j = 0; j < idx.length; j += step) {
        const i = idx[j];
        d += (j === 0 ? "M" : "L") + x(t[i]).toFixed(1) + "," + y(r.data[i]).toFixed(1);
      }
      return { d, top, zero: y(0), lo, hi };
    });
  }, [t, rows, t0, t1, vmin, vmax, W, LBL, ROW]);

  const ticks = useMemo(() => {
    const span = t1 - t0;
    const raw = span / (narrow ? 4 : 8);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const st = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
    const out: number[] = [];
    for (let v = Math.ceil(t0 / st) * st; v <= t1; v += st) out.push(+v.toFixed(6));
    return out;
  }, [t0, t1, narrow]);

  const toT = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return t0;
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    return t0 + ((px - LBL) / (W - LBL - 8)) * (t1 - t0);
  };

  const color = (key: string) =>
    COLORS[key] ?? (key.startsWith("OUT") || key === "I_OLED" ? OUT_COLOR : NODE_COLOR);

  return (
    <div className="wave" ref={boxRef}>
      <div className="wave-bar">
        <span>{t0.toFixed(1)} – {t1.toFixed(1)} µs</span>
        <span className="hint">가로로 드래그해서 확대 · 더블클릭으로 전체</span>
        <button onClick={() => setRange(full)}>전체</button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ touchAction: "pan-y" }}
        onPointerDown={(e) => setDrag([toT(e.clientX), toT(e.clientX)])}
        onPointerMove={(e) => drag && setDrag([drag[0], toT(e.clientX)])}
        onPointerUp={() => {
          if (drag && Math.abs(drag[1] - drag[0]) > (t1 - t0) / 200) {
            setRange([Math.min(...drag), Math.max(...drag)]);
          }
          setDrag(null);
        }}
        onDoubleClick={() => setRange(full)}
      >
        {ticks.map((v) => (
          <line key={v} x1={x(v)} x2={x(v)} y1={0} y2={H - AX} className="grid" />
        ))}
        {rows.map((r, k) => (
          <g key={r.key}>
            <rect x={LBL} y={paths[k].top} width={W - LBL - 8} height={ROW} className="lane" />
            <line x1={LBL} x2={W - 8} y1={paths[k].zero} y2={paths[k].zero} className="zero" />
            <text x={LBL - 6} y={paths[k].top + ROW / 2 + 4} textAnchor="end" className="lbl">
              {r.label}
            </text>
            {r.range && (
              <text x={W - 10} y={paths[k].top + 11} textAnchor="end" className="tick">
                {r.range[0].toFixed(1)}~{r.range[1].toFixed(1)}
              </text>
            )}
            <path d={paths[k].d} stroke={color(r.key)} fill="none" strokeWidth={1.4} />
          </g>
        ))}
        {ticks.map((v) => (
          <text key={"t" + v} x={x(v)} y={H - 8} textAnchor="middle" className="tick">{v}</text>
        ))}
        {drag && (
          <rect x={Math.min(x(drag[0]), x(drag[1]))} y={0}
            width={Math.abs(x(drag[1]) - x(drag[0]))} height={H - AX} className="sel" />
        )}
      </svg>
      <div className="hint">세로축: 각 행 {vmin} ~ {vmax} V (오른쪽 위에 범위가 적힌 행은 그 범위), 가는 선 = 0 · 시간 µs</div>
    </div>
  );
}
