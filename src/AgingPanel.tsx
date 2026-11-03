import { useState } from "react";
import { API } from "./api";
import { AgingResult, Deg } from "./types";

const LAW_LABEL: Record<string, string> = {
  dV_inf: "포화 ΔVth (V)", tau_85_h: "85 °C 시정수 (h)", beta: "β (늘어진 지수)", Ea_eV: "활성화 에너지 (eV)",
  V_ref: "기준 |Vgs| (V)", gamma: "전압 가속 지수", w_off: "꺼짐 스트레스 비중", k_mu: "Ion 감소 계수",
  k_ss: "SS 증가 계수", k_ioff: "Ioff 증가 계수",
};

// High-temperature long-term stress: run the nominal circuit, measure each
// TFT's gate stress, and turn it into dVth / Ion / Ioff / SS for the table.
export default function AgingPanel({ kind, desc, onApply, onReset }: {
  kind: "driver" | "pixel"; desc: object; onApply: (deg: Record<string, Deg>, temp: number) => void; onReset: () => void;
}) {
  const [temp, setTemp] = useState(85);
  const [hours, setHours] = useState(3000);
  const [hz, setHz] = useState(120);
  const [law, setLaw] = useState<Record<string, number>>({});
  const [res, setRes] = useState<AgingResult | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      const r = await fetch(API + "/aging", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, desc, temp_C: temp, hours, frame_hz: hz, law }),
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

  return (
    <section className="card">
      <h2>고온 장기 구동 열화</h2>
      <p className="hint">정상 회로를 한 번 돌려 TR마다 게이트에 걸린 스트레스(켜진 시간 비율, |Vgs|)를 재고,
        온도·시간에 따라 ΔVth·Ion·Ioff·SS 변화를 계산합니다. 열화 법칙은 합성 가정이며 아래 고급 설정에서 바꿀 수 있습니다.</p>
      <div className="grid4">
        <label className="num"><span>온도</span><input type="number" value={temp} onChange={(e) => setTemp(+e.target.value)} /><em>°C</em></label>
        <label className="num"><span>구동 시간</span><input type="number" step={500} value={hours} onChange={(e) => setHours(+e.target.value)} /><em>h</em></label>
        {kind === "driver" && (
          <label className="num"><span>패널 프레임</span><input type="number" value={hz} onChange={(e) => setHz(+e.target.value)} /><em>Hz</em></label>
        )}
      </div>
      <details>
        <summary>고급: 열화 법칙 계수</summary>
        <p className="hint">ΔVth = 포화ΔVth × (1 − exp(−(t_eff/τ)^β)), t_eff = 시간 × 평균[(|Vgs|/기준)^지수], τ = τ85 × exp(Ea/k·(1/T − 1/358 K)).
          켜짐 스트레스는 TR을 켜기 어렵게(+), 꺼짐 스트레스는 반대로 비중만큼 움직입니다.</p>
        <div className="grid4">
          {Object.entries(LAW_LABEL).map(([k, label]) => (
            <label key={k} className="num"><span>{label}</span>
              <input type="number" step="any" value={law[k] ?? ""} placeholder="기본값"
                onChange={(e) => setLaw({ ...law, [k]: parseFloat(e.target.value) })} /></label>
          ))}
        </div>
      </details>
      <div className="runbar">
        <button className="primary" onClick={go} disabled={busy}>{busy ? "계산 중…" : "열화 계산"}</button>
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
