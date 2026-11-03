import { useState } from "react";
import { API } from "./api";
import { AgingLawType, AgingResult, Deg } from "./types";

const STRETCHED_LABELS: Record<string, string> = {
  dV_inf: "포화 ΔVth (V)",
  tau_85_h: "85 °C 시정수 (h)",
  beta: "β (늘어진 지수)",
  Ea_eV: "활성화 에너지 (eV)",
  V_ref: "기준 |Vgs| (V)",
  gamma: "전압 가속 지수",
  w_off: "꺼짐 스트레스 비중",
  k_mu: "Ion 감소 계수",
  k_ss: "SS 증가 계수",
  k_ioff: "Ioff 증가 계수",
};

const POWER_LAW_LABELS: Record<string, string> = {
  A_pw: "Power Law 진폭 A (V)",
  n_pw: "시간 지수 n (t^n)",
  tau_pw_h: "Power Law 기준 시간 τ0 (h)",
  Ea_eV: "활성화 에너지 (eV)",
  V_ref: "기준 |Vgs| (V)",
  gamma: "전압 가속 지수",
  w_off: "꺼짐 스트레스 비중",
  k_mu: "Ion 감소 계수",
  k_ss: "SS 증가 계수",
  k_ioff: "Ioff 증가 계수",
};

// High-temperature long-term stress: run the nominal circuit, measure each
// TFT's gate stress, and turn it into dVth / Ion / Ioff / SS for the table.
export default function AgingPanel({ kind, desc, onApply, onReset }: {
  kind: "driver" | "pixel" | "hpd"; desc: object; onApply: (deg: Record<string, Deg>, temp: number) => void; onReset: () => void;
}) {
  const [temp, setTemp] = useState(85);
  const [hours, setHours] = useState(3000);
  const [hz, setHz] = useState(120);
  const [lawType, setLawType] = useState<AgingLawType>("stretched_exponential");
  const [law, setLaw] = useState<Record<string, number>>({});
  const [res, setRes] = useState<AgingResult | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      const r = await fetch(API + "/aging", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, desc, temp_C: temp, hours, frame_hz: hz, law_type: lawType, law }),
      });
      const j: AgingResult = await r.json();
      setRes(j);
      if (j.law && !Object.keys(law).length) setLaw(j.law);
    } catch {
      setRes({ ok: false, errors: ["서버 응답 없음"] });
    } finally {
      setBusy(false);
    }
  };

  const activeLabels = lawType === "power_law" ? POWER_LAW_LABELS : STRETCHED_LABELS;

  return (
    <section className="card">
      <h2>고온 장기 구동 열화 (Stretched Exponential / Power Law 선택)</h2>
      <p className="hint">정상 회로를 ngspice로 한 번 돌려 TR마다 게이트에 걸린 스트레스(켜진 시간 비율, |Vgs|)를 측정하고,
        선택한 열화 수식(Stretched Exponential 또는 Power Law)에 의거하여 ΔVth·Ion·Ioff·SS 변화를 계산합니다.</p>
      <div className="grid4">
        <label className="num">
          <span>열화 수식 (Equation)</span>
          <select value={lawType} onChange={(e) => setLawType(e.target.value as AgingLawType)}>
            <option value="stretched_exponential">Stretched Exponential (늘어진 지수식)</option>
            <option value="power_law">Power Law (멱법칙: A · (t/τ0)^n)</option>
          </select>
        </label>
        <label className="num"><span>온도</span><input type="number" value={temp} onChange={(e) => setTemp(+e.target.value)} /><em>°C</em></label>
        <label className="num"><span>구동 시간</span><input type="number" step={500} value={hours} onChange={(e) => setHours(+e.target.value)} /><em>h</em></label>
        {kind === "driver" && (
          <label className="num"><span>패널 프레임</span><input type="number" value={hz} onChange={(e) => setHz(+e.target.value)} /><em>Hz</em></label>
        )}
      </div>
      <details>
        <summary>고급: {lawType === "power_law" ? "Power Law (멱법칙)" : "Stretched Exponential (늘어진 지수)"} 계수 설정</summary>
        {lawType === "power_law" ? (
          <p className="hint">
            <b>Power Law 수식:</b> ΔVth = A_pw × (t_eff / (τ0 × AF_T))^n_pw, 여기서 t_eff = 시간 × 평균[(|Vgs|/V_ref)^γ], AF_T = exp(Ea/k·(1/T − 1/358 K)).
          </p>
        ) : (
          <p className="hint">
            <b>Stretched Exponential 수식:</b> ΔVth = dV_inf × (1 − exp(−(t_eff / τ)^β)), 여기서 t_eff = 시간 × 평균[(|Vgs|/V_ref)^γ], τ = τ85 × exp(Ea/k·(1/T − 1/358 K)).
          </p>
        )}
        <div className="grid4">
          {Object.entries(activeLabels).map(([k, label]) => (
            <label key={k} className="num"><span>{label}</span>
              <input type="number" step="any" value={law[k] ?? ""} placeholder="기본값"
                onChange={(e) => setLaw({ ...law, [k]: parseFloat(e.target.value) })} /></label>
          ))}
        </div>
      </details>
      <div className="runbar">
        <button className="primary" onClick={go} disabled={busy}>
          {busy ? "ngspice 스트레스 측정 및 열화 계산 중…" : `열화 계산 (${lawType === "power_law" ? "Power Law" : "Stretched Exp."})`}
        </button>
        <button className="ghost" onClick={onReset}>열화 지우기 (새 소자로)</button>
      </div>
      {res && !res.ok && <ul className="err">{res.errors?.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      {res?.ok && res.tft && (
        <>
          <p className="hint">{res.note}</p>
          <div className="scroll">
            <table className="small">
              <thead><tr><th>TFT</th><th>켜진 비율</th><th>켜짐 |Vgs| 평균</th><th>ΔVth V</th><th>Ion ×</th><th>Ioff ×</th><th>SS ×</th></tr></thead>
              <tbody>
                {Object.entries(res.tft).sort((a, b) => +a[0].slice(1) - +b[0].slice(1)).map(([k, r]) => (
                  <tr key={k} className={Math.abs(r.dVT) >= 1 ? "rowbad" : ""}>
                    <td><b>{k}</b></td><td>{(r.duty_on * 100).toFixed(1)}%</td><td>{r.vgs_on_avg.toFixed(1)}</td>
                    <td>{r.dVT > 0 ? "+" : ""}{r.dVT.toFixed(2)}</td><td>{r.mu.toFixed(3)}</td><td>{r.ioff.toFixed(2)}</td><td>{r.ss.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => {
            const deg: Record<string, Deg> = {};
            for (const [k, r] of Object.entries(res.tft!)) deg[k] = { dVT: r.dVT, mu: r.mu, ioff: r.ioff, ss: r.ss };
            onApply(deg, temp);
          }}>TFT 표에 반영 (온도 {temp} °C 포함)</button>
          <p className="hint">반영한 뒤 위의 실행 버튼으로 열화된 회로를 돌리거나, 아래 마진 맵으로 VGH·VGL을 바꿔 보세요.</p>
        </>
      )}
    </section>
  );
}
