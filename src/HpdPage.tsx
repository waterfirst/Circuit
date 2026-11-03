export default function HpdPage({ improved }: { improved: boolean }) {
  const current = improved ? 2.00842 : 0.44156;
  return <div>
    <h2>{improved ? "HPD 6T — 개선 5프레임 예제" : "HPD 6T — 제공된 초기 예제"}</h2>
    <p className="sub">탐색용 ngspice 예제입니다. 검증된 HPD 양산 타이밍, 패널 실측 결과, 검증된 파운드리 모델이 아닙니다.</p>
    <div className="card"><h3>시뮬레이션 결과</h3><table><tbody>
      <tr><th>조건</th><th>OLED 안정 전류</th><th>타이밍</th></tr>
      <tr><td>{improved ? "5프레임째, DATA=3 V, 5.2–5.6 ms" : "EM + EMB low, 450–850 us"}</td><td>{current} uA</td><td>{improved ? "5프레임 / 6 ms / 1 us step" : "1.2 ms / 2 us step"}</td></tr>
    </tbody></table></div>
    <div className="card"><h3>노드와 타이밍</h3>
      <p>{improved ? "리셋: GR high + GI/EMB low, 기록: GW high, 발광: EM/EMB low." : "제공된 EM/EMB 동시 low 타이밍."}</p>
      <p className="sub">노드: A, B, Q, ANODE. 3단자 컴팩트 모델이라 BML은 메타데이터로만 둡니다.</p>
    </div>
    <div className="card"><h3>한계</h3><ul><li>컴팩트 TFT 모델의 출처가 검증되지 않았습니다.</li><li>EMB 리셋 사용과 플로팅 노드 한계는 설계 검토가 필요합니다.</li><li>120 Hz 또는 양산 동작점으로 보지 마십시오.</li></ul></div>
  </div>;
}
