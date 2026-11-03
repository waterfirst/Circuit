import React from "react";
import { SchCap, SchDiode, SchTft } from "./Schematic";
import { netColor } from "./SchParts";

interface AutoStageDiagramProps {
  kind: "driver" | "pixel" | "hpd";
  title?: string;
  tfts: SchTft[];
  caps: SchCap[];
  diodes?: SchDiode[];
}

const TOP_RAILS = new Set(["VGH", "ELVDD", "VOBS", "VREF"]);
const BOT_RAILS = new Set(["VGL", "ELVSS", "VINT", "GND"]);
const INPUT_NETS = new Set(["IN", "FLM", "CLK1", "CLK2", "DATA", "GW", "GC", "GI", "EM", "EMB", "GR", "GO"]);
const OUTPUT_NETS = new Set(["OUT", "AN", "ANODE"]);

/**
 * Automatic 1-Stage Wired Circuit Diagram Generator.
 * Reads the current TFT, Capacitor, and Diode tables and synthesizes a complete
 * 1-stage schematic with top/bottom power rails, internal node buses, vertical/horizontal
 * wire routing, junction dots, BML back-gate electrodes, capacitors, and diodes.
 */
export default function AutoStageDiagram({
  kind,
  title,
  tfts,
  caps,
  diodes = [],
}: AutoStageDiagramProps) {
  // Collect all unique nets used in the 1-stage circuit
  const allNets = Array.from(
    new Set([
      ...tfts.flatMap((t) => (t.bml && t.bml_node ? [t.G, t.S, t.D, t.bml_node] : [t.G, t.S, t.D])),
      ...caps.flatMap((c) => [c.a, c.b]),
      ...diodes.flatMap((d) => [d.a, d.k]),
    ])
  );

  const topRails = allNets.filter((n) => TOP_RAILS.has(n));
  const botRails = allNets.filter((n) => BOT_RAILS.has(n));
  const internalNets = allNets.filter(
    (n) => !TOP_RAILS.has(n) && !BOT_RAILS.has(n)
  );

  // Sort internal nets: inputs first, then internal state nodes (A, B, C, Q, QB, G, S, D), then OUT/AN
  internalNets.sort((a, b) => {
    const score = (n: string) => {
      if (INPUT_NETS.has(n)) return 0;
      if (OUTPUT_NETS.has(n)) return 2;
      return 1;
    };
    return score(a) - score(b) || a.localeCompare(b);
  });

  const colSpacing = 125;
  const leftPad = 110;
  const rightPad = 90;
  const totalCols = Math.max(1, tfts.length + caps.length + diodes.length);
  const width = Math.max(760, leftPad + totalCols * colSpacing + rightPad);

  const topRailStartY = 32;
  const railGap = 22;
  const topBusEndY = topRailStartY + Math.max(1, topRails.length) * railGap;

  const compAreaHeight = 160;
  const compTopY = topBusEndY + 24;
  const compMidY = compTopY + compAreaHeight / 2;
  const compBotY = compTopY + compAreaHeight;

  const internalBusStartY = compBotY + 28;
  const internalGap = 20;
  const internalBusEndY = internalBusStartY + Math.max(1, internalNets.length) * internalGap;

  const botRailStartY = internalBusEndY + 22;
  const height = botRailStartY + Math.max(1, botRails.length) * railGap + 28;

  // Map every net to its horizontal bus Y coordinate
  const netY: Record<string, number> = {};
  topRails.forEach((n, idx) => {
    netY[n] = topRailStartY + idx * railGap;
  });
  internalNets.forEach((n, idx) => {
    netY[n] = internalBusStartY + idx * internalGap;
  });
  botRails.forEach((n, idx) => {
    netY[n] = botRailStartY + idx * railGap;
  });

  const getNetY = (n: string) => netY[n] ?? compMidY;

  return (
    <div className="sch" style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--fg)" }}>
          📐 {title || (kind === "driver" ? "1단 구동 회로 자동 배선도 (Auto-Synthesized 1-Stage Schematic)" : "화소 회로 1단 자동 배선도")}
        </span>
        <span className="hint" style={{ margin: 0 }}>
          TFT {tfts.length}개 · Cap {caps.length}개 · Diode {diodes.length}개 연결 반영
        </span>
      </div>

      <div className="scroll">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          style={{ maxWidth: "100%", background: "var(--card)", borderRadius: 8, border: "1px solid var(--line)" }}
        >
          {/* 1. Horizontal Power Rails & Internal Node Buses */}
          {allNets.map((net) => {
            const y = getNetY(net);
            const col = netColor(net);
            const isPower = TOP_RAILS.has(net) || BOT_RAILS.has(net);
            const isOut = OUTPUT_NETS.has(net);
            return (
              <g key={`bus-${net}`}>
                <line
                  x1={leftPad - 20}
                  y1={y}
                  x2={width - rightPad + 20}
                  y2={y}
                  stroke={col}
                  strokeWidth={isPower ? 2.4 : isOut ? 2.2 : 1.3}
                  strokeDasharray={isPower || isOut ? undefined : "4,3"}
                  opacity={isPower || isOut ? 0.9 : 0.65}
                />
                <rect
                  x={12}
                  y={y - 9}
                  width={leftPad - 36}
                  height={18}
                  rx={6}
                  fill="var(--card)"
                  stroke={col}
                  strokeWidth={1.4}
                />
                <text
                  x={12 + (leftPad - 36) / 2}
                  y={y + 4}
                  fontSize={11}
                  fontWeight={700}
                  fill={col}
                  textAnchor="middle"
                >
                  {net}
                </text>
                {isOut && (
                  <g>
                    <rect
                      x={width - rightPad + 24}
                      y={y - 10}
                      width={54}
                      height={20}
                      rx={8}
                      fill={col}
                    />
                    <text
                      x={width - rightPad + 51}
                      y={y + 4}
                      fontSize={11}
                      fontWeight={700}
                      fill="#fff"
                      textAnchor="middle"
                    >
                      {net} ▸
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* 2. TFTs */}
          {tfts.map((t, idx) => {
            const cx = leftPad + idx * colSpacing + 45;
            const cy = compMidY;
            const sy = cy - 26;
            const dy = cy + 26;
            const gx = cx - 26;
            const chx = cx - 10;
            const yG = getNetY(t.G);
            const yS = getNetY(t.S);
            const yD = getNetY(t.D);
            const cG = netColor(t.G);
            const cS = netColor(t.S);
            const cD = netColor(t.D);
            const isP = t.type !== "N";

            return (
              <g key={`tft-${t.name}`}>
                {/* Component card background */}
                <rect
                  x={cx - 46}
                  y={cy - 44}
                  width={92}
                  height={88}
                  rx={8}
                  fill="var(--card)"
                  stroke="var(--line)"
                  strokeWidth={1.2}
                />

                {/* Vertical wire from Source (cx, sy) to S bus */}
                <polyline
                  points={`${cx},${sy} ${cx + 16},${sy} ${cx + 16},${yS}`}
                  fill="none"
                  stroke={cS}
                  strokeWidth={1.5}
                />
                <circle cx={cx + 16} cy={yS} r={3.5} fill={cS} />

                {/* Vertical wire from Drain (cx, dy) to D bus */}
                <polyline
                  points={`${cx},${dy} ${cx + 24},${dy} ${cx + 24},${yD}`}
                  fill="none"
                  stroke={cD}
                  strokeWidth={1.5}
                />
                <circle cx={cx + 24} cy={yD} r={3.5} fill={cD} />

                {/* Vertical wire from Gate (gx, cy) to G bus */}
                <polyline
                  points={`${gx - 12},${cy} ${gx - 12},${yG}`}
                  fill="none"
                  stroke={cG}
                  strokeWidth={1.5}
                />
                <circle cx={gx - 12} cy={yG} r={3.5} fill={cG} />

                {/* TFT Symbol */}
                <line x1={gx - 12} y1={cy} x2={isP ? gx - 6 : gx} y2={cy} stroke="var(--fg)" strokeWidth={1.8} />
                {isP && <circle cx={gx - 3} cy={cy} r={3.2} fill="var(--card)" stroke="var(--fg)" strokeWidth={1.5} />}
                <line x1={gx} y1={cy - 18} x2={gx} y2={cy + 18} stroke="var(--fg)" strokeWidth={2.2} />
                <line x1={chx} y1={cy - 22} x2={chx} y2={cy + 22} stroke="var(--fg)" strokeWidth={2.4} />
                <polyline points={`${chx},${cy - 15} ${cx},${cy - 15} ${cx},${sy}`} fill="none" stroke="var(--fg)" strokeWidth={1.8} />
                <polyline points={`${chx},${cy + 15} ${cx},${cy + 15} ${cx},${dy}`} fill="none" stroke="var(--fg)" strokeWidth={1.8} />

                {/* BML back-gate plate & connection if enabled */}
                {t.bml && t.bml_node && (
                  <g>
                    <line
                      x1={chx + 6}
                      y1={cy - 14}
                      x2={chx + 6}
                      y2={cy + 14}
                      stroke="#d97706"
                      strokeWidth={2.2}
                      strokeDasharray="3,2"
                    />
                    <polyline
                      points={`${chx + 6},${cy} ${cx + 34},${cy} ${cx + 34},${getNetY(t.bml_node)}`}
                      fill="none"
                      stroke="#d97706"
                      strokeWidth={1.3}
                      strokeDasharray="2,2"
                    />
                    <circle cx={cx + 34} cy={getNetY(t.bml_node)} r={3} fill="#d97706" />
                    <text x={cx + 28} y={cy - 4} fontSize={8.5} fontWeight={700} fill="#d97706">
                      BML:{t.bml_node}
                    </text>
                  </g>
                )}

                {/* Labels */}
                <text x={cx - 40} y={cy - 28} fontSize={12} fontWeight={700} fill="var(--fg)">
                  {t.name}
                </text>
                <text x={cx + 40} y={cy - 28} fontSize={9.5} fontWeight={600} fill={isP ? "#be123c" : "#0369a1"} textAnchor="end">
                  {isP ? "PMOS" : "NMOS"}
                </text>
                {t.W && (
                  <text x={cx - 40} y={cy + 38} fontSize={9.5} fill="var(--muted)">
                    {t.W}/{t.L}µm
                  </text>
                )}
              </g>
            );
          })}

          {/* 3. Capacitors */}
          {caps.map((c, idx) => {
            const colIdx = tfts.length + idx;
            const cx = leftPad + colIdx * colSpacing + 45;
            const cy = compMidY;
            const yA = getNetY(c.a);
            const yB = getNetY(c.b);
            const colA = netColor(c.a);
            const colB = netColor(c.b);

            return (
              <g key={`cap-${c.name}-${idx}`}>
                <rect
                  x={cx - 38}
                  y={cy - 36}
                  width={76}
                  height={72}
                  rx={8}
                  fill="var(--card)"
                  stroke="var(--line)"
                  strokeWidth={1.2}
                />
                {/* Top plate wire to net a */}
                <polyline
                  points={`${cx},${cy - 7} ${cx},${cy - 24} ${cx - 10},${cy - 24} ${cx - 10},${yA}`}
                  fill="none"
                  stroke={colA}
                  strokeWidth={1.5}
                />
                <circle cx={cx - 10} cy={yA} r={3.5} fill={colA} />

                {/* Bottom plate wire to net b */}
                <polyline
                  points={`${cx},${cy + 7} ${cx},${cy + 24} ${cx + 10},${cy + 24} ${cx + 10},${yB}`}
                  fill="none"
                  stroke={colB}
                  strokeWidth={1.5}
                />
                <circle cx={cx + 10} cy={yB} r={3.5} fill={colB} />

                {/* Capacitor plates */}
                <line x1={cx - 18} y1={cy - 7} x2={cx + 18} y2={cy - 7} stroke="var(--fg)" strokeWidth={2.8} />
                <line x1={cx - 18} y1={cy + 7} x2={cx + 18} y2={cy + 7} stroke="var(--fg)" strokeWidth={2.8} />

                <text x={cx - 32} y={cy - 20} fontSize={11.5} fontWeight={700} fill="var(--fg)">
                  {c.name}
                </text>
                <text x={cx - 32} y={cy + 28} fontSize={9.5} fill="var(--muted)">
                  {c.value}
                </text>
              </g>
            );
          })}

          {/* 4. Diodes */}
          {diodes.map((d, idx) => {
            const colIdx = tfts.length + caps.length + idx;
            const cx = leftPad + colIdx * colSpacing + 45;
            const cy = compMidY;
            const yA = getNetY(d.a);
            const yK = getNetY(d.k);
            const colA = netColor(d.a);
            const colK = netColor(d.k);

            return (
              <g key={`diode-${d.name}-${idx}`}>
                <rect
                  x={cx - 38}
                  y={cy - 36}
                  width={76}
                  height={72}
                  rx={8}
                  fill="var(--card)"
                  stroke="var(--line)"
                  strokeWidth={1.2}
                />
                {/* Anode wire */}
                <polyline
                  points={`${cx},${cy - 12} ${cx},${cy - 24} ${cx - 10},${cy - 24} ${cx - 10},${yA}`}
                  fill="none"
                  stroke={colA}
                  strokeWidth={1.5}
                />
                <circle cx={cx - 10} cy={yA} r={3.5} fill={colA} />

                {/* Cathode wire */}
                <polyline
                  points={`${cx},${cy + 12} ${cx},${cy + 24} ${cx + 10},${cy + 24} ${cx + 10},${yK}`}
                  fill="none"
                  stroke={colK}
                  strokeWidth={1.5}
                />
                <circle cx={cx + 10} cy={yK} r={3.5} fill={colK} />

                {/* Diode symbol */}
                <polygon
                  points={`${cx - 13},${cy - 12} ${cx + 13},${cy - 12} ${cx},${cy + 12}`}
                  fill="none"
                  stroke="var(--fg)"
                  strokeWidth={1.8}
                />
                <line x1={cx - 13} y1={cy + 12} x2={cx + 13} y2={cy + 12} stroke="var(--fg)" strokeWidth={2.4} />

                <text x={cx - 32} y={cy - 20} fontSize={11.5} fontWeight={700} fill="var(--fg)">
                  {d.name}
                </text>
                {d.label && (
                  <text x={cx - 32} y={cy + 28} fontSize={9} fill="var(--muted)">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
