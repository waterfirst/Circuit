"""GW shift-register simulator core: validate a JSON circuit, build an
ngspice netlist (OSDI p-TFT model), run it, and judge the scan outputs.

Derived from ~/gw_lab/backend.py, with these changes:
- caps and W/L/dVT are inputs (no hidden per-topology caps)
- clocks toggle continuously by default (field LFD drive); "burst" parks them
- PASS/FAIL counts OUT pulses per frame, checks order, low level and hold high
"""
import os, re, shutil, subprocess, time, uuid
import numpy as np

import device

HERE = os.path.dirname(os.path.abspath(__file__))
RUNS = os.path.join(os.path.dirname(HERE), "runs")
OSDI = os.environ.get("GW_OSDI", os.path.join(HERE, "ptft_fit.osdi"))
NGSPICE = os.environ.get("GW_NGSPICE", "/usr/local/bin/ngspice" if os.path.exists("/usr/local/bin/ngspice") else "ngspice")
KEEP_RUNS = 400

RAILS = {"VGH", "VGL", "CLK1", "CLK2"}
STAGE_IO = {"IN", "OUT"}
INTERNAL = {"A", "B", "C", "D", "E", "Q", "QB"} | {f"N{i}" for i in range(1, 9)}
PIN_NETS = RAILS | STAGE_IO | INTERNAL
CAP_NETS = PIN_NETS | {"GND"}
TFT_NAMES = [f"T{i}" for i in range(1, 13)]

LIMITS = {
    "VGH": (4.0, 12.0), "VGL": (-14.0, -4.0), "freq_kHz": (30.0, 500.0),
    "stages": (1, 12), "frames": (1, 3), "hold_us": (0.0, 400.0),
    "W_um": (1.0, 200.0), "L_um": (2.0, 20.0), "dVT": (-1.0, 1.0),
    "C_pF": (0.001, 20.0), "VT0": (0.5, 2.0), "U0": (10.0, 200.0),
    "flm_lead_us": (0.0, 3.0), "flm_lag_us": (-3.0, 3.0),
    "out_low_req": (-14.0, 0.0), "hold_drop": (0.1, 5.0),
    "start_width_H": (0.5, 40.0), "start_lead_H": (0.0, 4.0),
}
MAX_TEND_US = 1500.0
PWFRAC = 0.75  # CLK low width as a fraction of H


def _num(desc, key, default, errors, cast=float):
    try:
        v = cast(desc.get(key, default))
    except (TypeError, ValueError):
        errors.append(f"{key}: 숫자가 아님")
        return default
    lo, hi = LIMITS[key]
    if not (lo <= v <= hi):
        errors.append(f"{key}={v} 범위 밖 ({lo}~{hi})")
    return v


def validate(desc):
    """Return (errors, warnings, norm). Never raises on bad input."""
    errors, warnings = [], []
    if not isinstance(desc, dict):
        return ["JSON 최상위는 객체여야 함"], [], {}
    n = {}
    for k, d in [("VGH", 8.0), ("VGL", -9.5), ("freq_kHz", 250.0), ("hold_us", 100.0),
                 ("VT0", 1.1), ("U0", 65.0), ("flm_lead_us", 0.0), ("flm_lag_us", 0.0),
                 ("out_low_req", -6.0), ("hold_drop", 1.0)]:
        n[k] = _num(desc, k, d, errors)
    for k, d in [("stages", 6), ("frames", 2)]:
        n[k] = _num(desc, k, d, errors, int)
    out_kind = desc.get("output", "low_pulse")
    if out_kind not in ("low_pulse", "high_pulse"):
        errors.append("output은 low_pulse(GW형) 또는 high_pulse(EM·GC·GI형)")
    n["output"] = out_kind
    n["start_width_H"] = _num(desc, "start_width_H", 4.0, errors)
    n["start_lead_H"] = _num(desc, "start_lead_H", 0.5, errors)
    n["temp_C"] = device.read_temp(desc, errors)
    mode = desc.get("clock_mode", "continuous")
    if mode not in ("continuous", "burst"):
        errors.append("clock_mode는 continuous 또는 burst")
    n["clock_mode"] = mode
    res = desc.get("resolution")
    n["resolution"] = res if isinstance(res, int) else None

    tft = desc.get("tft")
    if not isinstance(tft, dict) or not tft:
        errors.append("tft: {T1:{G,S,D,W,L}, ...} 형태여야 함")
        return errors, warnings, {}
    n["tft"], used = {}, {}
    for name, p in tft.items():
        if name not in TFT_NAMES:
            errors.append(f"TFT 이름 {name!r} 불가 (T1~T12)")
            continue
        if not isinstance(p, dict) or not {"G", "S", "D"} <= set(p):
            errors.append(f"{name}: G/S/D 세 핀이 모두 필요")
            continue
        row = {}
        for pin in ("G", "S", "D"):
            net = p[pin]
            if net == "FLM":  # legacy spelling of the stage input
                net = "IN"
            if net not in PIN_NETS:
                errors.append(f"{name}.{pin}={net!r} 불가 (허용: {', '.join(sorted(PIN_NETS))})")
                net = "VGH"
            row[pin] = net
            used.setdefault(net, []).append(f"{name}.{pin}")
        row.update(device.read_deg(p, name, errors))
        for k, key, d in [("W", "W_um", 4.0), ("L", "L_um", 4.5)]:
            try:
                v = float(p.get(k, d))
            except (TypeError, ValueError):
                errors.append(f"{name}.{k}: 숫자가 아님"); v = d
            lo, hi = LIMITS[key]
            if not (lo <= v <= hi):
                errors.append(f"{name}.{k}={v} 범위 밖 ({lo}~{hi})")
            row[k] = v
        if row["S"] == row["D"]:
            warnings.append(f"{name}: S와 D가 같은 노드({row['S']}) — 의미 없는 소자")
        n["tft"][name] = row

    caps = desc.get("caps", [])
    if not isinstance(caps, list):
        errors.append("caps: [{a,b,pF}] 목록이어야 함"); caps = []
    n["caps"] = []
    for i, c in enumerate(caps):
        if not isinstance(c, dict):
            errors.append(f"caps[{i}]: 객체가 아님"); continue
        a, b = c.get("a"), c.get("b")
        if a not in CAP_NETS or b not in CAP_NETS or a == b:
            errors.append(f"caps[{i}]: 노드 {a!r}-{b!r} 불가"); continue
        try:
            v = float(c.get("pF"))
        except (TypeError, ValueError):
            errors.append(f"caps[{i}].pF: 숫자가 아님"); continue
        lo, hi = LIMITS["C_pF"]
        if not (lo <= v <= hi):
            errors.append(f"caps[{i}].pF={v} 범위 밖 ({lo}~{hi})")
        n["caps"].append({"a": a, "b": b, "pF": v})
        for net in (a, b):
            used.setdefault(net, []).append(f"C{i + 1}")

    # topology sanity: every internal node needs a gate-independent connection
    for net in INTERNAL:
        refs = used.get(net, [])
        if not refs:
            continue
        sd = [r for r in refs if r.endswith(".S") or r.endswith(".D")]
        if not sd:
            errors.append(f"노드 {net}: TFT 소스/드레인 연결이 없어 떠 있음 ({', '.join(refs)})")
        elif len(refs) == 1:
            warnings.append(f"노드 {net}: 연결이 하나뿐 ({refs[0]})")
    if "IN" not in used:
        errors.append("IN(전단 출력/FLM)이 어디에도 안 붙음")
    if not any(r.endswith(".S") or r.endswith(".D") for r in used.get("OUT", [])):
        errors.append("OUT을 구동하는 TFT가 없음")
    n["internal"] = sorted(net for net in INTERNAL if net in used)
    if n["VGL"] > n["out_low_req"]:
        warnings.append(f"VGL {n['VGL']} V가 OUT Low 스펙 {n['out_low_req']} V보다 높음")
    return errors, warnings, n


def timing(n):
    H = 1000.0 / n["freq_kHz"]
    P, PW = 2 * H, H * PWFRAC
    TR = round(P * 0.00625, 4)
    T_s = 5 * P                       # FLM-sampling CLK1 low of frame 1
    scan = P * (n["stages"] / 2 + 2)  # time for the pulse to pass all stages
    if n["output"] == "high_pulse":
        scan += n["start_width_H"] * H
    # frame period must be a whole number of clock periods, otherwise the next
    # FLM no longer overlaps a CLK1 low and the second frame never starts
    frame = P * np.ceil((scan + max(n["hold_us"], P)) / P)
    TEND = T_s + frame * n["frames"]
    return dict(H=H, P=P, PW=PW, TR=TR, T_s=T_s, scan=scan, frame=frame, TEND=TEND)


def build_netlist(n, t):
    VGH, VGL, P, PW, TR = n["VGH"], n["VGL"], t["P"], t["PW"], t["TR"]

    def pwl(lows, width):
        pts = [(0.0, VGH)]
        for s in lows:
            pts += [(s, VGH), (s + TR, VGL), (s + width, VGL), (s + width + TR, VGH)]
        return " ".join(f"{a:.4f}u {b}" for a, b in pts)

    def clk_lows(off):
        first = t["T_s"] + off
        while first - P > 0:
            first -= P
        lows, s = [], first
        while s + PW < t["TEND"]:
            if n["clock_mode"] == "continuous":
                lows.append(s)
            else:  # burst: only from settle until each frame's scan has passed
                rel = (s - t["T_s"]) % t["frame"] if s >= t["T_s"] else -1
                if s < t["T_s"] or rel <= t["scan"]:
                    lows.append(s)
            s += P
        return lows

    if n["output"] == "high_pulse":
        # EM/GC/GI start pulse: rests at VGL, goes to VGH for start_width_H*H
        H = t["H"]
        flm_rise = [t["T_s"] + k * t["frame"] - n["start_lead_H"] * H for k in range(n["frames"])]
        pts = [(0.0, VGL)]
        for s0 in flm_rise:
            w = n["start_width_H"] * H
            pts += [(s0, VGL), (s0 + TR, VGH), (s0 + w, VGH), (s0 + w + TR, VGL)]
        flm_pwl = " ".join(f"{a:.4f}u {b}" for a, b in pts)
    else:
        flm_lows = [t["T_s"] + k * t["frame"] - n["flm_lead_us"] for k in range(n["frames"])]
        flm_pwl = pwl(flm_lows, PW + n["flm_lead_us"] + n["flm_lag_us"])
    L = [f"* GW service job: H={t['H']:.4f}us f={n['freq_kHz']}kHz VGH={VGH} VGL={VGL} "
         f"clock={n['clock_mode']} frames={n['frames']} hold={n['hold_us']}us output={n['output']} T={n['temp_C']}C"]
    for name, p in n["tft"].items():
        L.append(device.card(name, 1, p["W"], p["L"], n["VT0"], n["U0"], p, n["temp_C"]))
    L += [".subckt gw IN CKA CKB OUT VGH VGL", "* TFT lines: N<name> D G S model"]
    ren = {"CLK1": "CKA", "CLK2": "CKB"}
    for name, p in n["tft"].items():
        d, g, s = (ren.get(p[k], p[k]) for k in ("D", "G", "S"))
        L.append(f"N_{name} {d} {g} {s} m{name}")
    for i, c in enumerate(n["caps"], 1):
        a, b = (ren.get(x, "0" if x == "GND" else x) for x in (c["a"], c["b"]))
        L.append(f"C{i} {a} {b} {c['pF']}p")
    L += [".ends", f"VGH VGH 0 {VGH}", f"VGL VGL 0 {VGL}",
          f"VFLM FLM 0 PWL({flm_pwl})",
          f"VCLK1 CLK1 0 PWL({pwl(clk_lows(0.0), PW)})",
          f"VCLK2 CLK2 0 PWL({pwl(clk_lows(P / 2), PW)})"]
    prev = "FLM"
    for i in range(1, n["stages"] + 1):
        ck = ("CLK1", "CLK2") if i % 2 else ("CLK2", "CLK1")
        L.append(f"X{i} {prev} {ck[0]} {ck[1]} OUT{i} VGH VGL gw")
        prev = f"OUT{i}"
    vecs = ["v(FLM)", "v(CLK1)", "v(CLK2)"] + [f"v(OUT{i})" for i in range(1, n["stages"] + 1)]
    vecs += [f"v(x{i}.{m.lower()})" for i in range(1, n["stages"] + 1) for m in n["internal"]]
    L += [".options method=gear reltol=1e-4 abstol=1e-12 vntol=1e-6 gmin=1e-12",
          ".control", "set num_threads=1", "pre_osdi ptft_fit.osdi", f"tran 10n {t['TEND']:.3f}u 0 20n",
          "set wr_singlescale", "set wr_vecnames", f"wrdata out.txt {' '.join(vecs)}",
          ".endc", ".end"]
    return "\n".join(L) + "\n"


def judge(n, t, tu, cols):
    """Per stage and frame: exactly one active pulse, in scan order, with the
    right levels. low_pulse (GW): active = low, must reach out_low_req, rest
    stays >= VGH - hold_drop. high_pulse (EM/GC/GI): active = high, must reach
    VGH - hold_drop, rest stays <= out_low_req (emission/oxide-off level)."""
    VGH, VGL = n["VGH"], n["VGL"]
    mid = (VGH + VGL) / 2
    high = n["output"] == "high_pulse"
    stages, problems = [], []
    for k in range(n["frames"]):
        f0 = t["T_s"] + k * t["frame"] - t["P"]
        f1 = f0 + t["frame"]
        m = (tu >= f0) & (tu < f1)
        prev_t = None
        for i in range(1, n["stages"] + 1):
            o = cols[f"v(OUT{i})"][m]
            tt = tu[m]
            act = o > mid if high else o < mid
            starts = np.where(act[1:] & ~act[:-1])[0] + 1
            ends = np.where(~act[1:] & act[:-1])[0] + 1
            cnt = len(starts)
            t_first = float(tt[starts[0]]) if cnt else None
            width = None
            if cnt == 1 and len(ends) and ends[-1] > starts[0]:
                width = float(tt[ends[-1]] - tt[starts[0]])
            rest = np.ones_like(o, dtype=bool)
            if cnt:
                lo_t = tt[starts[0]] - t["P"] / 2
                hi_t = tt[ends[-1]] + t["P"] / 2 if len(ends) and ends[-1] > starts[0] else tt[-1]
                rest &= (tt < lo_t) | (tt > hi_t)
            if high:
                peak = float(o.max()) if len(o) else float("nan")
                rest_v = float(o[rest].max()) if rest.any() else float("nan")
            else:
                peak = float(o.min()) if len(o) else float("nan")
                rest_v = float(o[rest].min()) if rest.any() else float("nan")
            ok, why = True, []
            if cnt != 1:
                ok = False; why.append(f"펄스 {cnt}개")
            if high:
                if peak < VGH - n["hold_drop"]:
                    ok = False; why.append(f"High {peak:.2f} V < VGH−{n['hold_drop']} V")
                if rest_v > n["out_low_req"]:
                    ok = False; why.append(f"쉬는 동안 {rest_v:.2f} V까지 올라감 (스펙 ≤ {n['out_low_req']} V)")
                if width is not None:
                    want = n["start_width_H"] * t["H"]
                    if abs(width - want) > t["H"]:
                        ok = False; why.append(f"폭 {width:.2f} µs ≠ 시작 펄스 {want:.2f} µs ±1H")
            else:
                if peak > n["out_low_req"]:
                    ok = False; why.append(f"Low {peak:.2f} V > 스펙 {n['out_low_req']} V")
                if rest_v < VGH - n["hold_drop"]:
                    ok = False; why.append(f"홀드 중 {rest_v:.2f} V까지 처짐")
            if prev_t is not None and t_first is not None and t_first <= prev_t:
                ok = False; why.append("순서 뒤바뀜")
            prev_t = t_first if t_first is not None else prev_t
            stages.append({"frame": k + 1, "stage": i, "pulses": cnt,
                           "t_first_us": round(t_first, 3) if t_first is not None else None,
                           "width_us": round(width, 3) if width is not None else None,
                           "active_V": round(peak, 3), "rest_V": round(rest_v, 3),
                           "pass": ok, "why": why})
            if not ok:
                problems.append(f"F{k + 1} OUT{i}: " + ", ".join(why))
    return {"pass": not problems, "problems": problems, "stages": stages, "output": n["output"]}


def _prune_runs():
    try:
        jobs = sorted(os.listdir(RUNS))
    except FileNotFoundError:
        return
    for j in jobs[:-KEEP_RUNS]:
        shutil.rmtree(os.path.join(RUNS, j), ignore_errors=True)


def run(desc, timeout_s=120):
    errors, warnings, n = validate(desc)
    if errors:
        return {"ok": False, "errors": errors, "warnings": warnings}
    t = timing(n)
    if t["TEND"] > MAX_TEND_US:
        return {"ok": False, "errors": [f"시뮬레이션 길이 {t['TEND']:.0f} µs가 한도 {MAX_TEND_US:.0f} µs 초과 — 프레임 수나 hold_us를 줄이세요"],
                "warnings": warnings}
    os.makedirs(RUNS, exist_ok=True)
    jid = time.strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:6]
    jd = os.path.join(RUNS, jid)
    os.makedirs(jd)
    net = build_netlist(n, t)
    open(os.path.join(jd, "job.cir"), "w").write(net)
    os.symlink(OSDI, os.path.join(jd, "ptft_fit.osdi"))
    t0 = time.time()
    try:
        p = subprocess.run([NGSPICE, "-b", "job.cir"], cwd=jd, capture_output=True, text=True,
                           timeout=timeout_s, env={"PATH": os.environ.get("PATH", ""), "HOME": jd, "OMP_NUM_THREADS": "1"})
        log = p.stdout + p.stderr
    except subprocess.TimeoutExpired:
        return {"ok": False, "job": jid, "netlist": net, "warnings": warnings,
                "errors": [f"ngspice {timeout_s}s 초과 — 주파수·프레임·hold를 줄이세요"]}
    elapsed = round(time.time() - t0, 2)
    open(os.path.join(jd, "ngspice.log"), "w").write(log)
    out = os.path.join(jd, "out.txt")
    if not os.path.exists(out):
        tail = "\n".join(l for l in log.splitlines() if re.search(r"rror|too small|abort", l))[-800:]
        return {"ok": False, "job": jid, "netlist": net, "warnings": warnings,
                "errors": ["ngspice 출력 없음 (수렴 실패 가능)", tail]}
    head = open(out).readline().split()
    arr = np.loadtxt(out, skiprows=1, ndmin=2)
    tu = arr[:, 0] * 1e6
    cols = {h: arr[:, i] for i, h in enumerate(head) if h.startswith("v(")}
    verdict = judge(n, t, tu, cols)
    keep = np.linspace(0, len(tu) - 1, min(len(tu), 4000)).astype(int)
    series = {"t_us": np.round(tu[keep], 4).tolist()}
    for h, v in cols.items():
        series[h] = np.round(v[keep], 4).tolist()
    _prune_runs()
    return {"ok": True, "job": jid, "elapsed_s": elapsed, "warnings": warnings,
            "timing": {k: round(v, 4) for k, v in t.items()}, "verdict": verdict,
            "series": series, "netlist": net, "internal": n["internal"],
            "rails": {"VGH": n["VGH"], "VGL": n["VGL"]}}
