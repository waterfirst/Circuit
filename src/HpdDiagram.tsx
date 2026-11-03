import { useState } from "react";
import { HpdCircuit } from "./types";

type StepMode = "all" | "init" | "hold" | "write" | "emit";

const STEP_INFO: Record<StepMode, { title: string; signals: string; desc: string }> = {
  all: {
    title: "전체 회로 연결도 (HPD 6T2C)",
    signals: "회사 표기 번호: T1(Driving, NMOS) · T2(GW, NMOS) · T3(GR, NMOS) · T4(GI, PMOS) · T5(EM, PMOS) · T6(EMB, PMOS)",
    desc: "전원(ELVDD)에서 T5 → B → T1(구동) → Q → T6 → ANODE → OLED → ELVSS로 이어지며, T2/T3의 D는 A에, S는 각각 DATA/VREF에 연결됩니다. CST(A–Q)와 CHOLD(VREF–Q)가 Q 노드를 지지합니다.",
  },
  init: {
    title: "1단계 · 초기화 (11–70 µs)",
    signals: "GR = +8 V (High), GI = −9 V (Low), EMB = −9 V (Low), EM = +8 V (High)",
    desc: "T3가 켜져 게이트 노드 A를 VREF(1.4 V)에 연결하고, T6와 T4가 동시에 켜져 Q–ANODE–VINT(−1.0 V) 경로를 형성하여 Q≈−1.0 V, ANODE≈−1.0 V로 정착시킵니다.",
  },
  hold: {
    title: "2단계 · 유지 및 보상 확인 (71–99 µs)",
    signals: "GR · GW = −9 V (Low), GI · EM · EMB = +8 V (High)",
    desc: "스위치가 대부분 꺼진 유지 구간으로, A와 Q가 CST·CHOLD 및 기생 용량에 의해 유지되며 T1(구동)은 A와 B/Q의 순간 전압에 따라 도통될 수 있습니다.",
  },
  write: {
    title: "3단계 · DATA 기입 (101–200 µs)",
    signals: "GW = +8 V (High), GR = −9 V (Low), GI · EM · EMB = +8 V (High)",
    desc: "T2가 켜져 DATA 전압(예: 3.0 V)이 A 노드를 충전합니다. CST·CHOLD 용량 분배에 의해 Q와 B 전위도 함께 이동합니다(150 µs 기준 A≈3.0 V, B≈Q≈−0.15 V).",
  },
  emit: {
    title: "4단계 · 발광 (320–880 µs)",
    signals: "EM = −9 V (Low), EMB = −9 V (Low), GW · GR = −9 V (Low), GI = +8 V (High)",
    desc: "T5와 T6가 모두 켜져 ELVDD → T5 → B → T1(구동) → Q → T6 → ANODE → Vsense → OLED → ELVSS로 양(+)의 발광 전류(DATA=3 V 기준 약 2.008 µA)가 흐릅니다.",
  },
};

export default function HpdDiagram({ c }: { c: HpdCircuit }) {
  const [step, setStep] = useState<StepMode>("all");
  const wl = (k: string) => {
    const t = c.tft[k];
    return t ? `${t.W}/${t.L}µm` : "";
  };
  const info = STEP_INFO[step];

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <button type="button" className={step === "all" ? "primary" : "ghost"} style={{ padding: "4px 10px", fontSize: "0.82rem" }} onClick={() => setStep("all")}>
          전체 연결도
        </button>
        <button type="button" className={step === "init" ? "primary" : "ghost"} style={{ padding: "4px 10px", fontSize: "0.82rem" }} onClick={() => setStep("init")}>
          ① 초기화 (11–70 µs)
        </button>
        <button type="button" className={step === "hold" ? "primary" : "ghost"} style={{ padding: "4px 10px", fontSize: "0.82rem" }} onClick={() => setStep("hold")}>
          ② 유지·보상확인 (71–99 µs)
        </button>
        <button type="button" className={step === "write" ? "primary" : "ghost"} style={{ padding: "4px 10px", fontSize: "0.82rem" }} onClick={() => setStep("write")}>
          ③ DATA 기입 (101–200 µs)
        </button>
        <button type="button" className={step === "emit" ? "primary" : "ghost"} style={{ padding: "4px 10px", fontSize: "0.82rem" }} onClick={() => setStep("emit")}>
          ④ 발광 (320–880 µs)
        </button>
      </div>

      <div style={{ padding: "8px 12px", background: "var(--lane)", borderRadius: 6, borderLeft: "4px solid var(--accent)", marginBottom: 10, fontSize: "0.85rem" }}>
        <div><b>{info.title}</b> — <span style={{ color: "var(--accent)", fontWeight: 600 }}>{info.signals}</span></div>
        <div className="hint" style={{ marginTop: 3 }}>{info.desc}</div>
      </div>

      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 840" role="img" aria-label="Connected HPD 6T2C circuit">
        <defs>
          <marker id="hpd-arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0 0 L8 4 L0 8 Z" fill="#db3434" />
          </marker>
        </defs>
        <style>{`
          .hpd-wire { fill: none; stroke: #263b50; stroke-width: 3; stroke-linejoin: round; }
          .hpd-lab { font: 700 18px system-ui, sans-serif; fill: #103b66; }
          .hpd-dev { font: 700 18px system-ui, sans-serif; fill: #172d44; }
          .hpd-tiny { font: 14px system-ui, sans-serif; fill: #536579; }
          .hpd-node { fill: #263b50; }
          .hpd-hi { fill: none; stroke: #db3434; stroke-width: 6.5; stroke-linecap: round; stroke-linejoin: round; opacity: 0.85; }
        `}</style>

        {/* Highlighted active paths for each driving step */}
        {step === "init" && (
          <g>
            <path d="M650 455 V545" className="hpd-hi" />
            <path d="M950 455 V545" className="hpd-hi" />
            <path d="M190 410 H290" className="hpd-hi" />
            <path d="M650 435 V455 M650 545 V595 H950 V545 M340 410 H290 M190 410 H120 V330" className="hpd-hi" />
          </g>
        )}
        {step === "write" && (
          <g>
            <path d="M190 250 H290" className="hpd-hi" />
            <path d="M340 250 H290 M190 250 H120 V330 H555" className="hpd-hi" />
          </g>
        )}
        {step === "emit" && (
          <g>
            <path d="M650 105 V195" className="hpd-hi" />
            <path d="M650 285 V375" className="hpd-hi" />
            <path d="M650 455 V545" className="hpd-hi" />
            <path d="M650 52 V105 M650 195 V285 M650 375 V455 M650 545 V635 M650 667 V695 M650 724 V790" className="hpd-hi" />
            <path d="M705 200 V275" className="hpd-hi" markerEnd="url(#hpd-arr)" />
            <path d="M705 560 V620" className="hpd-hi" markerEnd="url(#hpd-arr)" />
          </g>
        )}

        {/* Main vertical branch: ELVDD -> T5(EM) -> B -> T1(Driving) -> Q -> T6(EMB) -> ANODE -> Vsense -> OLED -> ELVSS */}
        <path d="M650 52 V105" className="hpd-wire" />
        <path d="M650 105 V130 M650 130 V170 M650 170 V195 M632 126 V174" className="hpd-wire" />
        <path d="M555 150 H622" className="hpd-wire" />
        <circle cx="627" cy="150" r="5" fill="white" stroke="#263b50" strokeWidth="2.5" />
        <text x="668" y="146" className="hpd-dev">T5 ({wl("T5")})</text>
        <text x="668" y="167" className="hpd-tiny">{c.tft.T5?.type === "N" ? "NMOS" : "PMOS"} · EM 스위치</text>
        <text x="515" y="155" className="hpd-lab">EM</text>
        <text x="656" y="122" className="hpd-tiny">S</text>
        <text x="656" y="189" className="hpd-tiny">D</text>

        <path d="M650 195 V250" className="hpd-wire" />
        <circle cx="650" cy="250" r="5" className="hpd-node" />

        {/* T1 Driving TFT */}
        <path d="M650 285 V310 M650 310 V350 M650 350 V375 M632 306 V354" className="hpd-wire" />
        <path d="M555 330 H632" className="hpd-wire" />
        <text x="668" y="326" className="hpd-dev">T1 ({wl("T1")})</text>
        <text x="668" y="347" className="hpd-tiny">{c.tft.T1?.type === "P" ? "PMOS" : "NMOS"} · 구동 TFT</text>
        <text x="520" y="335" className="hpd-lab">A</text>
        <text x="656" y="302" className="hpd-tiny">S(B)</text>
        <text x="656" y="369" className="hpd-tiny">D(Q)</text>

        <path d="M650 250 V285 M650 375 V435" className="hpd-wire" />
        <circle cx="650" cy="435" r="5" className="hpd-node" />

        {/* T6 EMB TFT */}
        <path d="M650 455 V480 M650 480 V520 M650 520 V545 M632 476 V524" className="hpd-wire" />
        <path d="M555 500 H622" className="hpd-wire" />
        <circle cx="627" cy="500" r="5" fill="white" stroke="#263b50" strokeWidth="2.5" />
        <text x="668" y="496" className="hpd-dev">T6 ({wl("T6")})</text>
        <text x="668" y="517" className="hpd-tiny">{c.tft.T6?.type === "N" ? "NMOS" : "PMOS"} · EMB 발광/Q초기화</text>
        <text x="505" y="505" className="hpd-lab">EMB</text>
        <text x="656" y="472" className="hpd-tiny">S</text>
        <text x="656" y="539" className="hpd-tiny">D</text>

        <path d="M650 545 V595" className="hpd-wire" />
        <circle cx="650" cy="595" r="5" className="hpd-node" />

        <text x="605" y="38" className="hpd-lab">ELVDD ({c.ELVDD} V)</text>
        <text x="663" y="253" className="hpd-lab">B</text>
        <text x="663" y="438" className="hpd-lab">Q</text>
        <text x="663" y="599" className="hpd-lab">ANODE</text>

        {/* Vsense & OLED */}
        <path d="M650 595 V635" className="hpd-wire" />
        <rect x="619" y="635" width="62" height="32" rx="5" fill="white" stroke="#263b50" strokeWidth="2.5" />
        <text x="625" y="656" className="hpd-tiny">Vsense</text>
        <path d="M650 667 V695 M630 695 L670 695 L650 721 Z M628 724 H672 M650 724 V790" className="hpd-wire" />
        <text x="678" y="712" className="hpd-dev">OLED</text>
        <text x="600" y="818" className="hpd-lab">ELVSS ({c.ELVSS} V)</text>

        {/* T4 GI Anode/Q Initialization TFT */}
        <path d="M650 595 H950 V545" className="hpd-wire" />
        <path d="M950 455 V480 M950 480 V520 M950 520 V545 M932 476 V524" className="hpd-wire" />
        <path d="M855 500 H922" className="hpd-wire" />
        <circle cx="927" cy="500" r="5" fill="white" stroke="#263b50" strokeWidth="2.5" />
        <text x="968" y="496" className="hpd-dev">T4 ({wl("T4")})</text>
        <text x="968" y="517" className="hpd-tiny">{c.tft.T4?.type === "N" ? "NMOS" : "PMOS"} · GI 초기화</text>
        <text x="820" y="505" className="hpd-lab">GI</text>
        <text x="956" y="472" className="hpd-tiny">S</text>
        <text x="956" y="539" className="hpd-tiny">D</text>
        <path d="M950 455 V430" className="hpd-wire" />
        <text x="900" y="420" className="hpd-lab">VINT ({c.VINT} V)</text>

        {/* T2 GW Data Write TFT */}
        <path d="M190 250 H217 M217 250 H263 M263 250 H290 M217 233 H263 M240 175 V233" className="hpd-wire" />
        <text x="225" y="168" className="hpd-lab">GW</text>
        <text x="205" y="278" className="hpd-dev">T2 ({wl("T2")})</text>
        <text x="205" y="297" className="hpd-tiny">{c.tft.T2?.type === "P" ? "PMOS" : "NMOS"} · 데이터 기입</text>
        <text x="192" y="241" className="hpd-tiny">D</text>
        <text x="270" y="241" className="hpd-tiny">S</text>
        <path d="M290 250 H340" className="hpd-wire" />
        <text x="348" y="255" className="hpd-lab">DATA ({c.VDATA} V)</text>
        <path d="M190 250 H120 V330 H555" className="hpd-wire" />
        <circle cx="120" cy="330" r="5" className="hpd-node" />
        <text x="92" y="336" className="hpd-lab">A</text>

        {/* T3 GR Reference Reset TFT */}
        <path d="M190 410 H217 M217 410 H263 M263 410 H290 M217 393 H263 M240 335 V393" className="hpd-wire" />
        <text x="225" y="328" className="hpd-lab">GR</text>
        <text x="205" y="438" className="hpd-dev">T3 ({wl("T3")})</text>
        <text x="205" y="457" className="hpd-tiny">{c.tft.T3?.type === "P" ? "PMOS" : "NMOS"} · 기준전압 리셋</text>
        <text x="192" y="401" className="hpd-tiny">D</text>
        <text x="270" y="401" className="hpd-tiny">S</text>
        <path d="M190 410 H120 V330 M290 410 H340" className="hpd-wire" />
        <text x="348" y="415" className="hpd-lab">VREF ({c.VREF} V)</text>

        {/* CST (A - Q) */}
        <path d="M120 410 V540 H260 M260 520 V560 M274 520 V560 M274 540 H410 V435 H650" className="hpd-wire" />
        <text x="210" y="582" className="hpd-dev" style={{ fontSize: 15 }}>CST ({c.Cst_fF} fF = {(c.Cst_fF / 1000).toFixed(2)} pF)</text>
        <circle cx="650" cy="435" r="5" className="hpd-node" />

        {/* CHOLD (VREF - Q) */}
        <path d="M340 410 V625 H415 M415 605 V645 M429 605 V645 M429 625 H500 V435 H650" className="hpd-wire" />
        <text x="345" y="668" className="hpd-dev" style={{ fontSize: 15 }}>CHOLD ({c.Chold_fF} fF = {(c.Chold_fF / 1000).toFixed(2)} pF)</text>
        <circle cx="340" cy="410" r="5" className="hpd-node" />
        <circle cx="500" cy="435" r="5" className="hpd-node" />

        <text x="30" y="818" className="hpd-tiny">
          빨강 강조선: 선택한 구동 단계의 주요 도통 TFT 및 전류/전하 이동 경로 · 모델 정의: POL=−1 → NMOS, POL=+1 → PMOS
        </text>
      </svg>
    </div>
  );
}
