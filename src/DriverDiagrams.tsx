// Wired schematics for the driver presets. Drain/source connections are drawn
// as wires; gates and far-away nodes use net tags (same name = same node).
// Only valid while the connections equal the preset; DriverPage checks that.
import { Circuit } from "./types";
import { Cap, Dot, Fet, Gnd, Rail, Tag, Wire } from "./SchParts";

const wl = (c: Circuit, k: string) => (c.tft[k] ? `P ${c.tft[k].W}/${c.tft[k].L}` : "");
const cv = (c: Circuit, i: number) => (c.caps[i] ? `${c.caps[i].pF} pF` : "");

function GW78({ c, t8 }: { c: Circuit; t8: boolean }) {
  return (
    <svg viewBox="0 0 960 470" width="100%" style={{ minWidth: 760 }}>
      <Rail x1={230} x2={820} y={40} label="VGH" />
      <Tag x={120} y={138} net="IN" />
      <Fet x={120} y1={150} y2={260} gate="CLK1" side="L" name="T1" wl={wl(c, "T1")} />
      <Wire pts={[[120, 260], [600, 260]]} />
      <Dot x={300} y={260} label="B" dy={-8} />
      <Fet x={260} y1={40} y2={130} gate="B" side="L" name="T2" wl={wl(c, "T2")} />
      <Dot x={260} y={130} label="A" dx={-18} />
      <Cap x={260} y1={130} y2={260} name="C1" value={cv(c, 0)} />
      <Dot x={260} y={260} />
      <Fet x={400} y1={40} y2={130} gate="B" side="L" name="T4" wl={wl(c, "T4")} />
      <Fet x={400} y1={130} y2={260} gate="A" side="L" name="T5" wl={wl(c, "T5")} />
      <Dot x={400} y={130} label="QB" />
      <Dot x={400} y={260} />
      {t8 && (
        <g>
          <Wire pts={[[400, 130], [500, 130]]} />
          <Fet x={500} y1={130} y2={220} gate="CLK1" side="R" name="T8" wl={wl(c, "T8")} />
          <Tag x={500} y={232} net="VGL" />
        </g>
      )}
      <Fet x={600} y1={260} y2={380} gate="VGL" side="L" name="T3" wl={wl(c, "T3")} />
      <Wire pts={[[600, 380], [700, 380]]} />
      <Dot x={600} y={380} label="Q" dx={-18} dy={18} />
      <Cap x={700} y1={300} y2={380} name="C2" value={cv(c, 1)} />
      <Fet x={800} y1={40} y2={300} gate="QB" side="L" name="T6" wl={wl(c, "T6")} />
      <Fet x={800} y1={300} y2={420} gate="Q" side="L" name="T7" wl={wl(c, "T7")} />
      <Tag x={800} y={432} net="CLK2" />
      <Wire pts={[[700, 300], [900, 300]]} />
      <Dot x={800} y={300} />
      <Tag x={900} y={300} net="OUT" anchor="start" />
      <Cap x={870} y1={300} y2={370} name="CL" value={cv(c, 2)} labelSide="R" />
      <Dot x={870} y={300} />
      <Gnd x={870} y={370} />
    </svg>
  );
}

function GW9({ c }: { c: Circuit }) {
  return (
    <svg viewBox="0 0 960 480" width="100%" style={{ minWidth: 760 }}>
      <Rail x1={230} x2={820} y={40} label="VGH" />
      <Tag x={120} y={188} net="IN" />
      <Fet x={120} y1={200} y2={330} gate="CLK1" side="L" name="T1" wl={wl(c, "T1")} />
      <Wire pts={[[120, 330], [460, 330]]} />
      <Dot x={340} y={330} label="B" dy={-8} />
      <Fet x={260} y1={40} y2={150} gate="C" side="L" name="T2" wl={wl(c, "T2")} />
      <Dot x={260} y={150} label="A" dx={-18} />
      <Fet x={260} y1={150} y2={330} gate="CLK2" side="L" name="T3" wl={wl(c, "T3")} />
      <Dot x={260} y={330} />
      <Fet x={400} y1={40} y2={150} gate="B" side="L" name="T4" wl={wl(c, "T4")} />
      <Dot x={400} y={150} label="C" />
      <Fet x={400} y1={150} y2={250} gate="CLK2" side="L" name="T9" wl={wl(c, "T9")} />
      <Wire pts={[[400, 250], [520, 250]]} />
      <Dot x={400} y={250} label="QB" dx={-28} dy={18} />
      <Cap x={470} y1={40} y2={250} name="C1" value={cv(c, 0)} labelSide="R" />
      <Dot x={470} y={250} />
      <Fet x={520} y1={250} y2={320} gate="CLK1" side="R" name="T5" wl={wl(c, "T5")} />
      <Tag x={520} y={332} net="VGL" />
      <Fet x={460} y1={330} y2={440} gate="VGL" side="L" name="T8" wl={wl(c, "T8")} />
      <Wire pts={[[460, 440], [700, 440]]} />
      <Dot x={460} y={440} label="Q" dx={-18} dy={18} />
      <Cap x={700} y1={300} y2={440} name="C2" value={cv(c, 1)} />
      <Fet x={800} y1={40} y2={300} gate="QB" side="L" name="T6" wl={wl(c, "T6")} />
      <Fet x={800} y1={300} y2={420} gate="Q" side="L" name="T7" wl={wl(c, "T7")} />
      <Tag x={800} y={432} net="CLK2" />
      <Wire pts={[[700, 300], [900, 300]]} />
      <Dot x={800} y={300} />
      <Tag x={900} y={300} net="OUT" anchor="start" />
      <Cap x={870} y1={300} y2={370} name="CL" value={cv(c, 2)} labelSide="R" />
      <Dot x={870} y={300} />
      <Gnd x={870} y={370} />
    </svg>
  );
}

function EM({ c }: { c: Circuit }) {
  return (
    <svg viewBox="0 0 1260 520" width="100%" style={{ minWidth: 900 }}>
      <Rail x1={300} x2={1120} y={40} label="VGH" />
      <Tag x={130} y={138} net="IN" />
      <Fet x={130} y1={150} y2={260} gate="CLK1" side="L" name="T6" wl={wl(c, "T6")} />
      <Wire pts={[[130, 260], [220, 260]]} />
      <Dot x={175} y={260} label="N1" dy={-8} />
      <Fet x={220} y1={260} y2={380} gate="VGL" side="L" name="T3" wl={wl(c, "T3")} />
      <Wire pts={[[160, 380], [340, 380]]} />
      <Dot x={220} y={380} label="N3" dy={18} />
      <Dot x={160} y={380} />
      <Cap x={160} y1={380} y2={470} name="C1" value={cv(c, 0)} />
      <Tag x={160} y={482} net="CLK2" />
      <Fet x={340} y1={40} y2={280} gate="N2" side="R" name="T1" wl={wl(c, "T1")} />
      <Dot x={340} y={280} label="N7" dx={-26} />
      <Fet x={340} y1={280} y2={380} gate="CLK2" side="R" name="T2" wl={wl(c, "T2")} />
      <Tag x={580} y={98} net="CLK1" />
      <Fet x={580} y1={110} y2={210} gate="N1" side="L" name="T7" wl={wl(c, "T7")} />
      <Fet x={580} y1={210} y2={310} gate="CLK1" side="L" name="T8" wl={wl(c, "T8")} />
      <Tag x={580} y={322} net="VGL" />
      <Wire pts={[[580, 210], [700, 210]]} />
      <Dot x={580} y={210} />
      <Dot x={650} y={210} label="N2" dy={-8} />
      <Fet x={700} y1={210} y2={320} gate="VGL" side="R" name="T9" wl={wl(c, "T9")} />
      <Dot x={700} y={320} label="N5" dx={-30} />
      <Cap x={700} y1={320} y2={420} name="C2" value={cv(c, 1)} />
      <Tag x={700} y={432} net="N6" />
      <Fet x={900} y1={40} y2={150} gate="N1" side="L" name="T12" wl={wl(c, "T12")} />
      <Wire pts={[[900, 150], [980, 150]]} />
      <Dot x={900} y={150} label="N4" dx={-28} dy={18} />
      <Cap x={980} y1={40} y2={150} name="C3" value={cv(c, 2)} labelSide="R" />
      <Fet x={900} y1={150} y2={270} gate="CLK2" side="L" name="T10" wl={wl(c, "T10")} />
      <Dot x={900} y={270} label="N6" />
      <Fet x={900} y1={270} y2={380} gate="N5" side="L" name="T11" wl={wl(c, "T11")} />
      <Tag x={900} y={392} net="CLK2" />
      <Fet x={1100} y1={40} y2={280} gate="N4" side="L" name="T4" wl={wl(c, "T4")} />
      <Fet x={1100} y1={280} y2={480} gate="N3" side="L" name="T5" wl={wl(c, "T5")} />
      <Rail x1={1070} x2={1130} y={480} label="VGL" />
      <Wire pts={[[1100, 280], [1200, 280]]} />
      <Dot x={1100} y={280} />
      <Tag x={1200} y={280} net="OUT" anchor="start" />
      <Cap x={1170} y1={280} y2={350} name="CL" value={cv(c, 3)} labelSide="R" />
      <Dot x={1170} y={280} />
      <Gnd x={1170} y={350} />
    </svg>
  );
}

export const DIAGRAM_KEYS = new Set(["7T", "8T", "9T", "EM", "GC", "GI"]);

export default function DriverDiagram({ k, c }: { k: string; c: Circuit }) {
  if (k === "7T") return <GW78 c={c} t8={false} />;
  if (k === "8T") return <GW78 c={c} t8 />;
  if (k === "9T") return <GW9 c={c} />;
  return <EM c={c} />;
}
