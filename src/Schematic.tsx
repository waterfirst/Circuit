import { useEffect, useRef, useState } from "react";

export interface SchTft { name: string; type: "P" | "N"; G: string; S: string; D: string; W?: number; L?: number }
export interface SchCap { name: string; a: string; b: string; value: string }
export interface SchDiode { name: string; a: string; k: string; label?: string }

interface Props { tfts: SchTft[]; caps: SchCap[]; diodes?: SchDiode[]; title?: string }

const RAIL_HI = new Set(["VGH", "ELVDD", "VOBS"]);
const RAIL_LO = new Set(["VGL", "ELVSS", "VINT", "GND"]);

// Same net -> same color, so connections read across the sheet.
function netColor(net: string): string {
  if (RAIL_HI.has(net)) return "#dc2626";
  if (RAIL_LO.has(net)) return "#2563eb";
  if (/^CLK|^GW$|^GC$|^GI$|^EM$|^GO$/.test(net)) return "#0d9488";
  if (net === "IN" || net === "OUT" || net === "DATA") return "#7c3aed";
  let h = 0;
  for (const ch of net) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${(h * 7) % 360} 65% 40%)`;
}

function Label({ x, y, net, anchor }: { x: number; y: number; net: string; anchor: "start" | "end" | "middle" }) {
  const w = Math.max(28, net.length * 8 + 10);
  const rx = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  const c = netColor(net);
  return (
    <g>
      <rect x={rx} y={y - 10} width={w} height={20} rx={10} fill="var(--card)" stroke={c} strokeWidth={1.5} />
      <text x={rx + w / 2} y={y + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill={c}>{net}</text>
    </g>
  );
}

// TFT symbol in a 200x140 cell: gate on the left, source on top, drain at bottom.
// PMOS has the gate bubble; NMOS has none. Arrow on the source marks polarity.
function Tft({ t, x, y }: { t: SchTft; x: number; y: number }) {
  const gx = x + 70, cx = x + 86, mid = y + 70;
  const ink = "var(--fg)";
  return (
    <g>
      <text x={x + 12} y={y + 20} fontSize={13} fontWeight={700} fill={ink}>{t.name}</text>
      <text x={x + 12} y={y + 34} fontSize={10} fill="var(--muted)">{t.type === "P" ? "PMOS" : "NMOS"}</text>
      {t.W ? <text x={x + 12} y={y + 128} fontSize={10} fill="var(--muted)">W/L {t.W}/{t.L}</text> : null}
      {/* gate */}
      <line x1={x + 46} y1={mid} x2={t.type === "P" ? gx - 8 : gx} y2={mid} stroke={ink} strokeWidth={1.6} />
      {t.type === "P" && <circle cx={gx - 4} cy={mid} r={4} fill="none" stroke={ink} strokeWidth={1.6} />}
      <line x1={gx} y1={mid - 22} x2={gx} y2={mid + 22} stroke={ink} strokeWidth={2.2} />
      {/* channel */}
      <line x1={cx} y1={mid - 26} x2={cx} y2={mid + 26} stroke={ink} strokeWidth={2.2} />
      {/* source (top) and drain (bottom) */}
      <polyline points={`${cx},${mid - 18} ${cx + 30},${mid - 18} ${cx + 30},${y + 30}`} fill="none" stroke={ink} strokeWidth={1.6} />
      <polyline points={`${cx},${mid + 18} ${cx + 30},${mid + 18} ${cx + 30},${y + 112}`} fill="none" stroke={ink} strokeWidth={1.6} />
      {t.type === "P"
        ? <polygon points={`${cx + 4},${mid - 18} ${cx + 14},${mid - 23} ${cx + 14},${mid - 13}`} fill={ink} />
        : <polygon points={`${cx + 16},${mid + 18} ${cx + 6},${mid + 13} ${cx + 6},${mid + 23}`} fill={ink} />}
      <text x={cx + 36} y={mid - 22} fontSize={10} fill="var(--muted)">S</text>
      <text x={cx + 36} y={mid + 30} fontSize={10} fill="var(--muted)">D</text>
      <text x={x + 48} y={mid - 6} fontSize={10} fill="var(--muted)">G</text>
      <Label x={x + 46} y={mid} net={t.G} anchor="end" />
      <Label x={cx + 30} y={y + 22} net={t.S} anchor="middle" />
      <Label x={cx + 30} y={y + 120} net={t.D} anchor="middle" />
    </g>
  );
}

function Cap({ c, x, y }: { c: SchCap; x: number; y: number }) {
  const cx = x + 100, ink = "var(--fg)";
  return (
    <g>
      <text x={cx + 26} y={y + 74} fontSize={13} fontWeight={700} fill={ink}>{c.name}</text>
      <text x={cx + 26} y={y + 90} fontSize={11} fill="var(--muted)">{c.value}</text>
      <line x1={cx} y1={y + 30} x2={cx} y2={y + 64} stroke={ink} strokeWidth={1.6} />
      <line x1={cx - 22} y1={y + 64} x2={cx + 22} y2={y + 64} stroke={ink} strokeWidth={2.6} />
      <line x1={cx - 22} y1={y + 76} x2={cx + 22} y2={y + 76} stroke={ink} strokeWidth={2.6} />
      <line x1={cx} y1={y + 76} x2={cx} y2={y + 110} stroke={ink} strokeWidth={1.6} />
      <Label x={cx} y={y + 22} net={c.a} anchor="middle" />
      <Label x={cx} y={y + 120} net={c.b} anchor="middle" />
    </g>
  );
}

function Diode({ d, x, y }: { d: SchDiode; x: number; y: number }) {
  const cx = x + 100, ink = "var(--fg)";
  return (
    <g>
      <text x={cx + 28} y={y + 72} fontSize={13} fontWeight={700} fill={ink}>{d.name}</text>
      {d.label && <text x={cx + 28} y={y + 88} fontSize={11} fill="var(--muted)">{d.label}</text>}
      <line x1={cx} y1={y + 30} x2={cx} y2={y + 56} stroke={ink} strokeWidth={1.6} />
      <polygon points={`${cx - 16},${y + 56} ${cx + 16},${y + 56} ${cx},${y + 82}`} fill="none" stroke={ink} strokeWidth={1.8} />
      <line x1={cx - 16} y1={y + 82} x2={cx + 16} y2={y + 82} stroke={ink} strokeWidth={2.4} />
      {/* light arrows: it is an OLED */}
      <path d={`M${cx + 20},${y + 62} l12,-8 m-5,0 l5,0 l0,5 M${cx + 20},${y + 72} l12,-8 m-5,0 l5,0 l0,5`} stroke={ink} fill="none" strokeWidth={1.2} />
      <line x1={cx} y1={y + 82} x2={cx} y2={y + 110} stroke={ink} strokeWidth={1.6} />
      <Label x={cx} y={y + 22} net={d.a} anchor="middle" />
      <Label x={cx} y={y + 120} net={d.k} anchor="middle" />
    </g>
  );
}

// Net-label schematic: every terminal ends in a labelled tag, and equal tags
// (same name, same color) are the same node. Always matches the netlist.
export default function Schematic({ tfts, caps, diodes = [], title }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const CW = 210, CH = 140;
  const cols = Math.max(1, Math.min(5, Math.floor(w / CW)));
  const items = [
    ...tfts.map((t) => ({ k: "t" + t.name, el: (x: number, y: number) => <Tft t={t} x={x} y={y} /> })),
    ...caps.map((c) => ({ k: "c" + c.name, el: (x: number, y: number) => <Cap c={c} x={x} y={y} /> })),
    ...diodes.map((d) => ({ k: "d" + d.name, el: (x: number, y: number) => <Diode d={d} x={x} y={y} /> })),
  ];
  const rows = Math.ceil(items.length / cols);
  const nets = Array.from(new Set([...tfts.flatMap((t) => [t.G, t.S, t.D]), ...caps.flatMap((c) => [c.a, c.b]),
    ...diodes.flatMap((d) => [d.a, d.k])])).sort();
  return (
    <div ref={box} className="sch">
      {title && <div className="hint">{title}</div>}
      <svg viewBox={`0 0 ${cols * CW} ${rows * CH}`} width={cols * CW} style={{ maxWidth: "100%" }}>
        {items.map((it, i) => (
          <g key={it.k}>
            <rect x={(i % cols) * CW + 4} y={Math.floor(i / cols) * CH + 2} width={CW - 8} height={CH - 4} rx={8} className="schcell" />
            {it.el((i % cols) * CW, Math.floor(i / cols) * CH)}
          </g>
        ))}
      </svg>
      <div className="netlegend">
        {nets.map((n) => <span key={n} style={{ color: netColor(n), borderColor: netColor(n) }}>{n}</span>)}
      </div>
      <div className="hint">같은 이름·색의 태그는 같은 노드에 연결됨. 넷리스트와 항상 일치하게 자동으로 그려짐.</div>
    </div>
  );
}
