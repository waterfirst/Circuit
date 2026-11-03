// Shared schematic primitives for the hand-placed (wired) diagrams.
export const INK = "var(--fg)";

const RAIL_HI = new Set(["VGH", "ELVDD", "VOBS"]);
const RAIL_LO = new Set(["VGL", "ELVSS", "VINT", "GND"]);
export function netColor(net: string): string {
  if (RAIL_HI.has(net)) return "#dc2626";
  if (RAIL_LO.has(net)) return "#2563eb";
  if (/^CLK|^GW$|^GC$|^GI$|^EM$|^GO$/.test(net)) return "#0d9488";
  if (net === "IN" || net === "OUT" || net === "DATA") return "#7c3aed";
  let h = 0;
  for (const ch of net) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${(h * 7) % 360} 65% 40%)`;
}

/** Vertical TFT. Top terminal at y1, bottom at y2, gate on side L or R.
 *  The gate is a net-name tag unless `gate` is empty (wired elsewhere). */
export function Fet({ x, y1, y2, gate, side, n, name, wl }: {
  x: number; y1: number; y2: number; gate: string; side: "L" | "R"; n?: boolean; name: string; wl: string;
}) {
  const ym = (y1 + y2) / 2, s = side === "L" ? -1 : 1;
  const ch = x + 14 * s, gp = x + 22 * s, glen = 40;
  return (
    <g>
      <polyline points={`${x},${y1} ${x},${ym - 16} ${ch},${ym - 16}`} fill="none" stroke={INK} strokeWidth={1.6} />
      <polyline points={`${x},${y2} ${x},${ym + 16} ${ch},${ym + 16}`} fill="none" stroke={INK} strokeWidth={1.6} />
      <line x1={ch} y1={ym - 24} x2={ch} y2={ym + 24} stroke={INK} strokeWidth={2.4} />
      <line x1={gp} y1={ym - 20} x2={gp} y2={ym + 20} stroke={INK} strokeWidth={2.4} />
      {!n && <circle cx={gp + 5 * s} cy={ym} r={4} fill="var(--card)" stroke={INK} strokeWidth={1.5} />}
      <line x1={gp + (n ? 0 : 9) * s} y1={ym} x2={gp + glen * s} y2={ym} stroke={INK} strokeWidth={1.6} />
      {gate && <Tag x={gp + glen * s} y={ym} net={gate} anchor={side === "L" ? "end" : "start"} />}
      <text x={x - 8 * s} y={ym - 4} fontSize={13} fontWeight={700} fill={INK}
        textAnchor={side === "L" ? "start" : "end"}>{name}</text>
      <text x={x - 8 * s} y={ym + 12} fontSize={10} fill="var(--muted)"
        textAnchor={side === "L" ? "start" : "end"}>{wl}</text>
    </g>
  );
}

/** Net-name tag (rounded pill). Same name = same node. */
export function Tag({ x, y, net, anchor = "middle" }: { x: number; y: number; net: string; anchor?: "start" | "end" | "middle" }) {
  const w = Math.max(26, net.length * 8 + 10);
  const rx = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  const c = netColor(net);
  return (
    <g>
      <rect x={rx} y={y - 9} width={w} height={18} rx={9} fill="var(--card)" stroke={c} strokeWidth={1.5} />
      <text x={rx + w / 2} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={c}>{net}</text>
    </g>
  );
}

export function Wire({ pts }: { pts: [number, number][] }) {
  return <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={INK} strokeWidth={1.6} />;
}

export function Dot({ x, y, label, dx = 7, dy = -6 }: { x: number; y: number; label?: string; dx?: number; dy?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={3.5} fill={INK} />
      {label && <text x={x + dx} y={y + dy} fontSize={12} fontWeight={700} fill={netColor(label)}>{label}</text>}
    </g>
  );
}

export function Rail({ x1, x2, y, label }: { x1: number; x2: number; y: number; label: string }) {
  const c = netColor(label);
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={c} strokeWidth={2.4} />
      <text x={x1 - 6} y={y + 4} fontSize={12} fontWeight={700} fill={c} textAnchor="end">{label}</text>
    </g>
  );
}

/** Vertical capacitor between y1 (top) and y2 (bottom) at x. */
export function Cap({ x, y1, y2, name, value, labelSide = "L" }: {
  x: number; y1: number; y2: number; name: string; value: string; labelSide?: "L" | "R";
}) {
  const ym = (y1 + y2) / 2;
  const tx = labelSide === "L" ? x - 26 : x + 26, an = labelSide === "L" ? "end" : "start";
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={ym - 6} stroke={INK} strokeWidth={1.6} />
      <line x1={x - 18} y1={ym - 6} x2={x + 18} y2={ym - 6} stroke={INK} strokeWidth={2.6} />
      <line x1={x - 18} y1={ym + 6} x2={x + 18} y2={ym + 6} stroke={INK} strokeWidth={2.6} />
      <line x1={x} y1={ym + 6} x2={x} y2={y2} stroke={INK} strokeWidth={1.6} />
      <text x={tx} y={ym - 2} fontSize={12} fontWeight={700} fill={INK} textAnchor={an}>{name}</text>
      <text x={tx} y={ym + 12} fontSize={10} fill="var(--muted)" textAnchor={an}>{value}</text>
    </g>
  );
}

export function Gnd({ x, y }: { x: number; y: number }) {
  return (
    <g stroke={INK} strokeWidth={1.6}>
      <line x1={x - 12} y1={y} x2={x + 12} y2={y} />
      <line x1={x - 7} y1={y + 5} x2={x + 7} y2={y + 5} />
      <line x1={x - 2} y1={y + 10} x2={x + 2} y2={y + 10} />
    </g>
  );
}
