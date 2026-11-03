// Wired schematic of the default 8T1C LTPO pixel. Only valid for the preset
// connections; PixelPage falls back to the net-label Schematic otherwise.
import { PixelCircuit } from "./types";

const INK = "var(--fg)";

function Fet({ x, y1, y2, gate, side, n, name, wl }: {
  x: number; y1: number; y2: number; gate: string; side: "L" | "R"; n?: boolean; name: string; wl: string;
}) {
  const ym = (y1 + y2) / 2, s = side === "L" ? -1 : 1;
  const ch = x + 14 * s, gp = x + 22 * s, glen = 46;
  return (
    <g>
      <polyline points={`${x},${y1} ${x},${ym - 16} ${ch},${ym - 16}`} fill="none" stroke={INK} strokeWidth={1.6} />
      <polyline points={`${x},${y2} ${x},${ym + 16} ${ch},${ym + 16}`} fill="none" stroke={INK} strokeWidth={1.6} />
      <line x1={ch} y1={ym - 24} x2={ch} y2={ym + 24} stroke={INK} strokeWidth={2.4} />
      <line x1={gp} y1={ym - 20} x2={gp} y2={ym + 20} stroke={INK} strokeWidth={2.4} />
      {!n && <circle cx={gp + 5 * s} cy={ym} r={4} fill="var(--card)" stroke={INK} strokeWidth={1.5} />}
      <line x1={gp + (n ? 0 : 9) * s} y1={ym} x2={gp + glen * s} y2={ym} stroke={INK} strokeWidth={1.6} />
      <text x={gp + (glen + 4) * s} y={ym + 4} fontSize={12} fontWeight={700} fill="#0d9488"
        textAnchor={side === "L" ? "end" : "start"}>{gate}</text>
      <text x={x - 10 * s} y={ym - 4} fontSize={13} fontWeight={700} fill={INK}
        textAnchor={side === "L" ? "start" : "end"}>{name}</text>
      <text x={x - 10 * s} y={ym + 12} fontSize={10} fill="var(--muted)"
        textAnchor={side === "L" ? "start" : "end"}>{(n ? "N " : "P ") + wl}</text>
    </g>
  );
}

function Rail({ x1, x2, y, label, color }: { x1: number; x2: number; y: number; label: string; color: string }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth={2.4} />
      <text x={x1 - 6} y={y + 4} fontSize={12} fontWeight={700} fill={color} textAnchor="end">{label}</text>
    </g>
  );
}

function Dot({ x, y, label }: { x: number; y: number; label?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={3.5} fill={INK} />
      {label && <text x={x + 7} y={y - 6} fontSize={12} fontWeight={700} fill="#7c3aed">{label}</text>}
    </g>
  );
}

export default function PixelDiagram({ c }: { c: PixelCircuit }) {
  const wl = (k: string) => `${c.tft[k]?.W}/${c.tft[k]?.L}`;
  const W = 800, H = 500;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} style={{ maxWidth: "100%" }}>
      <g transform="translate(80,0)">
      <Rail x1={150} x2={340} y={30} label={`ELVDD ${c.ELVDD} V`} color="#dc2626" />
      <Rail x1={260} x2={360} y={470} label={`ELVSS ${c.ELVSS} V`} color="#2563eb" />
      {/* T5: ELVDD -> S */}
      <Fet x={320} y1={30} y2={130} gate="EM" side="L" name="T5" wl={wl("T5")} />
      {/* S node */}
      <line x1={320} y1={130} x2={600} y2={130} stroke={INK} strokeWidth={1.6} />
      <Dot x={320} y={130} label="S" />
      {/* T2: DATA -> S (gate GW) */}
      <text x={450} y={36} fontSize={12} fontWeight={700} fill="#7c3aed" textAnchor="middle">DATA {c.VDATA} V</text>
      <Fet x={450} y1={44} y2={130} gate="GW" side="R" name="T2" wl={wl("T2")} />
      {/* T8: VOBS -> S (gate GO) */}
      <text x={600} y={36} fontSize={12} fontWeight={700} fill="#dc2626" textAnchor="middle">VOBS {c.VOBS} V</text>
      <Fet x={600} y1={44} y2={130} gate="GO" side="R" name="T8" wl={wl("T8")} />
      {/* T1 drive: S -> D, gate G */}
      <Fet x={320} y1={130} y2={250} gate="" side="L" name="T1" wl={wl("T1")} />
      {/* G node: gate of T1 */}
      <line x1={252} y1={190} x2={180} y2={190} stroke={INK} strokeWidth={1.6} />
      <Dot x={180} y={190} label="G" />
      {/* Cst: ELVDD - G */}
      <line x1={180} y1={30} x2={180} y2={92} stroke={INK} strokeWidth={1.6} />
      <line x1={160} y1={92} x2={200} y2={92} stroke={INK} strokeWidth={2.6} />
      <line x1={160} y1={104} x2={200} y2={104} stroke={INK} strokeWidth={2.6} />
      <line x1={180} y1={104} x2={180} y2={190} stroke={INK} strokeWidth={1.6} />
      <text x={152} y={102} fontSize={12} fontWeight={700} fill={INK} textAnchor="end">Cst {c.Cst_fF} fF</text>
      {/* T3 (N, GC): G -> D */}
      <line x1={180} y1={190} x2={180} y2={200} stroke={INK} strokeWidth={1.6} />
      <Fet x={180} y1={200} y2={280} gate="GC" side="L" n name="T3" wl={wl("T3")} />
      <line x1={180} y1={280} x2={320} y2={280} stroke={INK} strokeWidth={1.6} />
      <line x1={320} y1={250} x2={320} y2={280} stroke={INK} strokeWidth={1.6} />
      <Dot x={320} y={280} label="D" />
      {/* T4 (N, GI): G -> VINT */}
      <line x1={180} y1={190} x2={20} y2={190} stroke={INK} strokeWidth={1.6} />
      <Fet x={20} y1={190} y2={290} gate="GI" side="L" n name="T4" wl={wl("T4")} />
      <text x={20} y={306} fontSize={12} fontWeight={700} fill="#2563eb" textAnchor="middle">VINT {c.VINT} V</text>
      {/* T6: D -> AN (gate EM) */}
      <Fet x={320} y1={280} y2={370} gate="EM" side="L" name="T6" wl={wl("T6")} />
      <Dot x={320} y={370} label="AN" />
      {/* OLED + Coled */}
      <line x1={320} y1={370} x2={320} y2={400} stroke={INK} strokeWidth={1.6} />
      <polygon points="304,400 336,400 320,426" fill="none" stroke={INK} strokeWidth={1.8} />
      <line x1={304} y1={426} x2={336} y2={426} stroke={INK} strokeWidth={2.4} />
      <path d="M340,404 l12,-8 m-5,0 l5,0 l0,5 M340,414 l12,-8 m-5,0 l5,0 l0,5" stroke={INK} fill="none" strokeWidth={1.2} />
      <line x1={320} y1={426} x2={320} y2={470} stroke={INK} strokeWidth={1.6} />
      <text x={296} y={420} fontSize={12} fontWeight={700} fill={INK} textAnchor="end">OLED</text>
      {/* T7: AN -> VINT (gate GO) */}
      <line x1={320} y1={370} x2={450} y2={370} stroke={INK} strokeWidth={1.6} />
      <Fet x={450} y1={370} y2={450} gate="GO" side="R" name="T7" wl={wl("T7")} />
      <text x={450} y={466} fontSize={12} fontWeight={700} fill="#2563eb" textAnchor="middle">VINT</text>
      <text x={560} y={300} fontSize={11} fill="var(--muted)" textAnchor="middle">Coled {c.Coled_fF} fF</text>
      <text x={560} y={314} fontSize={11} fill="var(--muted)" textAnchor="middle">(AN–ELVSS)</text>
      </g>
    </svg>
  );
}
