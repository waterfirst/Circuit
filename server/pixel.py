"""8T1C LTPO pixel simulator (public-literature topology, synthetic values).

T1 drive (LTPS P) | T2 data write (P, GW) | T3 Vth compensation (oxide N, GC)
T4 gate init to VINT (oxide N, GI) | T5/T6 emission (P, EM)
T7 anode init (P, GO) | T8 on-bias to T1 source (P, GO)
Topology refs: US 11,056,060 B2, US 11,600,229 B2. Not any manufacturer's netlist.
"""
import copy, os, re, shutil, subprocess, time, uuid
import numpy as np

_trapz = getattr(np, "trapezoid", None) or np.trapz  # numpy < 2 has only trapz

import device
from sim import NGSPICE, OSDI, RUNS, _prune_runs

NETS = ["ELVDD", "ELVSS", "VINT", "VOBS", "DATA", "GW", "GC", "GI", "EM", "GO",
        "G", "S", "D", "AN"]
SIGS = ["GI", "GC", "GW", "EM", "GO"]
ACTIVE_HIGH = {"GI", "GC"}           # drive n-type oxide TFTs
LIM = {"VGH": (4, 15), "VGL": (-15, -3), "ELVDD": (0, 10), "ELVSS": (-8, 2), "VINT": (-8, 2),
       "VOBS": (-8, 10), "VDATA": (-2, 10), "Cst_fF": (5, 1000), "Coled_fF": (1, 1000),
       "frame_hz": (1, 240), "W": (0.5, 100), "L": (1, 50), "dVT": (-2, 2)}
MAX_FRAME_US = 50_000

PRESET = {
    "name": "8T1C LTPO 화소 (공개 문헌 토폴로지, 합성 값)",
    "VGH": 8.0, "VGL": -7.0, "ELVDD": 4.6, "ELVSS": -3.0, "VINT": -3.5, "VOBS": 5.5,
    "VDATA": 3.0, "Cst_fF": 100, "Coled_fF": 30, "frame_hz": 120, "vth_check": True,
    "models": {"P": {"VT0": 1.1, "U0": 65}, "N": {"VT0": 0.5, "U0": 15}},
    # [start, end] in µs from frame start; GW is a short write inside GC
    "timing_us": {"EM": [0, 1200], "GI": [100, 400], "GC": [500, 900],
                  "GW": [800, 808], "GO": [1000, 1150]},
    "tft": {
        "T1": {"type": "P", "G": "G", "S": "S", "D": "D", "W": 3, "L": 16},
        "T2": {"type": "P", "G": "GW", "S": "DATA", "D": "S", "W": 3, "L": 3},
        "T3": {"type": "N", "G": "GC", "S": "G", "D": "D", "W": 3, "L": 3.5},
        "T4": {"type": "N", "G": "GI", "S": "VINT", "D": "G", "W": 3, "L": 3.5},
        "T5": {"type": "P", "G": "EM", "S": "ELVDD", "D": "S", "W": 3, "L": 3},
        "T6": {"type": "P", "G": "EM", "S": "D", "D": "AN", "W": 3, "L": 3},
        "T7": {"type": "P", "G": "GO", "S": "VINT", "D": "AN", "W": 3, "L": 3},
        "T8": {"type": "P", "G": "GO", "S": "VOBS", "D": "S", "W": 3, "L": 3},
    },
}


def validate(desc):
    errors, warnings = [], []
    if not isinstance(desc, dict):
        return ["JSON 최상위는 객체여야 함"], [], {}
    n = {}
    for k in ["VGH", "VGL", "ELVDD", "ELVSS", "VINT", "VOBS", "VDATA", "Cst_fF", "Coled_fF", "frame_hz"]:
        try:
            v = float(desc.get(k, PRESET[k]))
        except (TypeError, ValueError):
            errors.append(f"{k}: 숫자가 아님"); continue
        lo, hi = LIM[k]
        if not lo <= v <= hi:
            errors.append(f"{k}={v} 범위 밖 ({lo}~{hi})")
        n[k] = v
    n["vth_check"] = bool(desc.get("vth_check", True))
    n["temp_C"] = device.read_temp(desc, errors)
    n["models"] = {}
    for ty, d in PRESET["models"].items():
        src = (desc.get("models") or {}).get(ty, {})
        try:
            vt, u0 = float(src.get("VT0", d["VT0"])), float(src.get("U0", d["U0"]))
        except (TypeError, ValueError):
            errors.append(f"models.{ty}: 숫자가 아님"); vt, u0 = d["VT0"], d["U0"]
        if not (0.0 <= vt <= 3.0 and 1 <= u0 <= 200):
            errors.append(f"models.{ty}: VT0 0~3 V, U0 1~200 범위")
        n["models"][ty] = {"VT0": vt, "U0": u0}
    frame = 1e6 / n.get("frame_hz", 120)
    if frame > MAX_FRAME_US:
        errors.append(f"프레임 {frame:.0f} µs가 한도 {MAX_FRAME_US} µs 초과 (주파수를 올리세요)")
    n["frame_us"] = frame
    tm = desc.get("timing_us", PRESET["timing_us"])
    n["timing"] = {}
    for sgl in SIGS:
        try:
            a, b = (float(x) for x in tm[sgl])
        except (KeyError, TypeError, ValueError):
            errors.append(f"timing_us.{sgl}: [시작, 끝] µs 두 숫자"); continue
        if not (0 <= a < b < frame):
            errors.append(f"timing_us.{sgl}=[{a}, {b}] 은 0 ≤ 시작 < 끝 < 프레임({frame:.0f} µs) 이어야 함")
        n["timing"][sgl] = (a, b)
    tft = desc.get("tft")
    if not isinstance(tft, dict) or not tft:
        errors.append("tft가 비어 있음"); return errors, warnings, n
    n["tft"] = {}
    for name, p in tft.items():
        if not re.fullmatch(r"T([1-9]|1[0-2])", str(name)) or not isinstance(p, dict):
            errors.append(f"TFT 이름 {name!r} 불가"); continue
        row = {"type": p.get("type", "P")}
        if row["type"] not in ("P", "N"):
            errors.append(f"{name}.type은 P 또는 N")
        for pin in ("G", "S", "D"):
            if p.get(pin) not in NETS:
                errors.append(f"{name}.{pin}={p.get(pin)!r} 불가 (허용: {', '.join(NETS)})")
            row[pin] = p.get(pin, "G")
        row.update(device.read_deg(p, name, errors))
        for k in ("W", "L"):
            try:
                v = float(p.get(k, 3.0))
            except (TypeError, ValueError):
                errors.append(f"{name}.{k}: 숫자가 아님"); v = 0.0
            lo, hi = LIM[k]
            if not lo <= v <= hi:
                errors.append(f"{name}.{k}={v} 범위 밖 ({lo}~{hi})")
            row[k] = v
        n["tft"][name] = row
    if not any(r["D"] == "AN" or r["S"] == "AN" for r in n["tft"].values()):
        errors.append("AN(OLED 애노드)에 붙은 TFT가 없음")
    if "T1" not in n["tft"]:
        errors.append("구동 TFT T1이 필요 (dVT 보상 확인에 씀)")
    return errors, warnings, n


def netlist(n, t1_dvt=0.0, probe=True):
    fr = n["frame_us"]
    VGH, VGL, e = n["VGH"], n["VGL"], 1.0  # 1 µs edges

    def pulse(sig):
        a, b = n["timing"][sig]
        rest, act = (VGL, VGH) if sig in ACTIVE_HIGH or sig == "EM" else (VGH, VGL)
        return f"PULSE({rest} {act} {max(a, 0.001):.4f}u {e}u {e}u {max(b - a - e, e):.4f}u {fr:.4f}u)"

    L = ["* 8T1C LTPO pixel (GW service)",
         ".options abstol=1e-16 reltol=1e-5 vntol=1e-8 method=gear"]
    for name, p in n["tft"].items():
        m = n["models"][p["type"]]
        deg = dict(p, dVT=p["dVT"] + (t1_dvt if name == "T1" else 0.0))
        pol = 1 if p["type"] == "P" else -1
        L.append(device.card(name, pol, p["W"], p["L"], m["VT0"], m["U0"], deg, n["temp_C"]))
    L += [".model oled D(IS=6e-26 N=3 RS=10k)",
          f"VELVDD ELVDD 0 {n['ELVDD']}", f"VELVSS ELVSS 0 {n['ELVSS']}",
          f"VVINT VINT 0 {n['VINT']}", f"VVOBS VOBS 0 {n['VOBS']}", f"VDATA DATA 0 {n['VDATA']}"]
    L += [f"V{sgl} {sgl} 0 {pulse(sgl)}" for sgl in SIGS]
    for name, p in n["tft"].items():
        L.append(f"N_{name} {p['D']} {p['G']} {p['S']} m{name}")
    L += [f"Cst ELVDD G {n['Cst_fF']}f", f"Coled AN ELVSS {n['Coled_fF']}f",
          "Vsense AN ANO 0", "Doled ANO ELVSS oled",
          ".control", "set num_threads=1", "pre_osdi ptft_fit.osdi", f"tran 2u {2 * fr:.3f}u 0 10u"]
    if probe:
        L += ["set wr_singlescale", "set wr_vecnames",
              "wrdata out.txt v(G) v(S) v(D) v(AN) v(GI) v(GC) v(GW) v(EM) v(GO) i(Vsense)"]
    else:
        L += ["set wr_singlescale", "wrdata out.txt i(Vsense) v(G)"]
    L += [".endc", ".end"]
    return "\n".join(L) + "\n"


def _sim(n, t1_dvt, probe, jd, tag):
    sub = os.path.join(jd, tag)
    os.makedirs(sub)
    open(os.path.join(sub, "job.cir"), "w").write(netlist(n, t1_dvt, probe))
    os.symlink(OSDI, os.path.join(sub, "ptft_fit.osdi"))
    p = subprocess.run([NGSPICE, "-b", "job.cir"], cwd=sub, capture_output=True, text=True,
                       timeout=90, env={"PATH": os.environ.get("PATH", ""), "HOME": sub, "OMP_NUM_THREADS": "1"})
    open(os.path.join(sub, "ngspice.log"), "w").write(p.stdout + p.stderr)
    out = os.path.join(sub, "out.txt")
    if not os.path.exists(out):
        raise RuntimeError("ngspice 출력 없음 (수렴 실패 가능)")
    arr = np.loadtxt(out, skiprows=1 if probe else 0, ndmin=2)
    head = [h.lower() for h in open(out).readline().split()] if probe else ["time", "i(vsense)", "v(g)"]
    return head, arr


def _metrics(n, tu, i_an, vg):
    fr = n["frame_us"]
    em_end = n["timing"]["EM"][1]
    m_em = (tu >= fr + em_end + 50) & (tu <= 2 * fr - 5)
    m_fr = tu >= fr
    i_em = float(_trapz(i_an[m_em], tu[m_em]) / (tu[m_em][-1] - tu[m_em][0]))
    i_fr = float(_trapz(i_an[m_fr], tu[m_fr]) / (tu[m_fr][-1] - tu[m_fr][0]))
    vg_em = float(np.mean(vg[m_em]))
    gc_end = fr + n["timing"]["GC"][1]
    vg_after_gc = float(vg[np.searchsorted(tu, gc_end + 5)])
    return {"I_em_nA": round(i_em * 1e9, 3), "I_frame_nA": round(i_fr * 1e9, 3),
            "Vg_em_V": round(vg_em, 4), "Vg_after_GC_V": round(vg_after_gc, 4)}


def run(desc):
    errors, warnings, n = validate(desc)
    if errors:
        return {"ok": False, "errors": errors, "warnings": warnings}
    os.makedirs(RUNS, exist_ok=True)
    jid = "px_" + time.strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:6]
    jd = os.path.join(RUNS, jid)
    os.makedirs(jd)
    t0 = time.time()
    try:
        head, arr = _sim(n, 0.0, True, jd, "nom")
    except (RuntimeError, subprocess.TimeoutExpired) as exc:
        return {"ok": False, "job": jid, "errors": [str(exc)], "warnings": warnings,
                "netlist": netlist(n)}
    tu = arr[:, 0] * 1e6
    col = {h: arr[:, i] for i, h in enumerate(head)}
    i_an = col["i(vsense)"]
    met = _metrics(n, tu, i_an, col["v(g)"])
    comp = None
    if n["vth_check"]:
        comp = []
        for dv in (-0.2, 0.2):
            try:
                _, a2 = _sim(n, dv, False, jd, f"dvt{dv:+.1f}")
            except (RuntimeError, subprocess.TimeoutExpired):
                comp.append({"dVT": dv, "error": "수렴 실패"}); continue
            m2 = _metrics(n, a2[:, 0] * 1e6, a2[:, 1], a2[:, 2])
            ch = (m2["I_em_nA"] / met["I_em_nA"] - 1) * 100 if met["I_em_nA"] else float("nan")
            comp.append({"dVT": dv, **m2, "I_change_pct": round(ch, 2)})
        comp.insert(1, {"dVT": 0.0, **met, "I_change_pct": 0.0})

    # Fresh vs Aged Comparison
    comparison = None
    has_deg = any(abs(float(p.get("dVT", 0.0))) > 1e-4 or abs(float(p.get("mu", 1.0)) - 1.0) > 1e-4 for p in n["tft"].values())
    if has_deg or desc.get("compare_fresh", True):
        try:
            n_fresh = copy.deepcopy(n)
            for p in n_fresh["tft"].values():
                p["dVT"], p["mu"], p["ioff"], p["ss"] = 0.0, 1.0, 1.0, 1.0
            _, a_fresh = _sim(n_fresh, 0.0, False, jd, "fresh_ref")
            m_fresh = _metrics(n_fresh, a_fresh[:, 0] * 1e6, a_fresh[:, 1], a_fresh[:, 2])
            i_fresh = m_fresh["I_em_nA"]
            i_cur = met["I_em_nA"]
            ch = (i_cur / i_fresh - 1) * 100 if i_fresh > 0 else 0.0
            vg_shift = met["Vg_after_GC_V"] - m_fresh["Vg_after_GC_V"]
            comparison = {
                "fresh_I_em_nA": round(i_fresh, 2),
                "aged_I_em_nA": round(i_cur, 2),
                "I_change_pct": round(ch, 2),
                "fresh_Vg_after_GC_V": round(m_fresh["Vg_after_GC_V"], 3),
                "aged_Vg_after_GC_V": round(met["Vg_after_GC_V"], 3),
                "vg_shift_V": round(vg_shift, 3),
                "t1_dVT": round(n["tft"]["T1"]["dVT"], 3),
                "compensated": abs(ch) < 10.0,
            }
        except Exception:
            pass

    # last frame only, downsampled, current in nA
    m = tu >= n["frame_us"]
    keep = np.flatnonzero(m)
    keep = keep[np.linspace(0, len(keep) - 1, min(len(keep), 4000)).astype(int)]
    series = {"t_us": np.round(tu[keep] - n["frame_us"], 3).tolist()}
    for h in head[1:]:
        v = col[h][keep] * (1e9 if h == "i(vsense)" else 1)
        series["I_OLED_nA" if h == "i(vsense)" else h.upper().replace("V(", "v(")] = np.round(v, 4).tolist()
    shutil.rmtree(jd, ignore_errors=True)
    _prune_runs()
    return {"ok": True, "job": jid, "elapsed_s": round(time.time() - t0, 2), "warnings": warnings,
            "metrics": met, "vth_check": comp, "comparison": comparison, "series": series,
            "netlist": netlist(n), "frame_us": n["frame_us"]}
