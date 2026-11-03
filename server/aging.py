"""Long-term high-temperature stress -> per-TFT degradation, and VGH/VGL margin maps.

Stress law (synthetic assumption, editable via "law"): bias-temperature stress
as a stretched exponential in effective time,
    dV = dV_inf * (1 - exp(-(t_eff / tau(T))**beta)),
    t_eff = hours * mean_t[(|Vgs_stress| / V_ref)**gamma],
    tau(T) = tau_85 * exp(Ea/k * (1/T - 1/T_85)).
On-state stress (p-type: Vg below the higher of S/D; n-type: Vg above the lower)
makes the TFT harder to turn on (+dVT). Off-state stress shifts the other way
with weight w_off. Mobility, SS and Ioff follow the on-stress fraction.
The gate bias history comes from a nominal simulation of the same circuit.
"""
import copy, itertools, threading, time, uuid
from concurrent.futures import ThreadPoolExecutor

import numpy as np

import pixel, sim
from device import K_B

LAW = {"dV_inf": 2.0, "tau_85_h": 1000.0, "beta": 0.45, "Ea_eV": 0.5, "V_ref": 10.0,
       "gamma": 1.5, "w_off": 0.3, "k_mu": 0.15, "k_ss": 0.3, "k_ioff": 3.0}
LAW_LIM = {"dV_inf": (0, 10), "tau_85_h": (1, 1e7), "beta": (0.1, 1), "Ea_eV": (0, 2),
           "V_ref": (1, 30), "gamma": (0.5, 4), "w_off": (0, 1), "k_mu": (0, 0.9),
           "k_ss": (0, 3), "k_ioff": (0, 100)}
DEG_FIELDS = ("dVT", "mu", "ioff", "ss")


def _law(user):
    law, errors = dict(LAW), []
    for k, v in (user or {}).items():
        if k in LAW_LIM:
            try:
                v = float(v)
            except (TypeError, ValueError):
                errors.append(f"law.{k}: 숫자가 아님"); continue
            lo, hi = LAW_LIM[k]
            if not lo <= v <= hi:
                errors.append(f"law.{k}={v} 범위 밖 ({lo}~{hi})")
            law[k] = v
    return law, errors


def fresh(desc):
    """Copy of desc with every degradation field removed."""
    d = copy.deepcopy(desc)
    for p in d.get("tft", {}).values():
        for k in DEG_FIELDS:
            p.pop(k, None)
    return d


def _stress(vg, vs, vd, pol, mask_w, law):
    """Weighted mean accel factors for on- and off-state gate stress."""
    if pol > 0:   # p-type: on when gate is below the source (higher S/D)
        v = vg - np.maximum(vs, vd)
        on, off = np.clip(-v, 0, None), np.clip(v, 0, None)
    else:         # n-type: on when gate is above the source (lower S/D)
        v = vg - np.minimum(vs, vd)
        on, off = np.clip(v, 0, None), np.clip(-v, 0, None)
    acc_on = (on / law["V_ref"]) ** law["gamma"]
    acc_off = (off / law["V_ref"]) ** law["gamma"]
    w = mask_w / mask_w.sum()
    return float((acc_on * w).sum()), float((acc_off * w).sum()), \
        float(((on > 0.5) * w).sum()), float((on * (on > 0.5) * w).sum() / max(((on > 0.5) * w).sum(), 1e-12))


def _shift(acc, hours, temp_C, law):
    T, T85 = temp_C + 273.15, 85 + 273.15
    tau = law["tau_85_h"] * np.exp(law["Ea_eV"] / K_B * (1 / T - 1 / T85))
    return law["dV_inf"] * (1 - np.exp(-((hours * acc / tau) ** law["beta"])))


def _degrade(acc_on, acc_off, hours, temp_C, law):
    d_on = _shift(acc_on, hours, temp_C, law)
    d_off = law["w_off"] * _shift(acc_off, hours, temp_C, law)
    frac = d_on / law["dV_inf"] if law["dV_inf"] else 0.0
    frac = float(frac)
    return {"dVT": round(float(d_on - d_off), 4), "mu": round(1 - law["k_mu"] * frac, 4),
            "ss": round(1 + law["k_ss"] * frac, 4), "ioff": round(1 + law["k_ioff"] * frac, 4)}


def estimate(req):
    """req: {kind: driver|pixel, desc, temp_C, hours, frame_hz?, law?}"""
    kind = req.get("kind")
    law, errors = _law(req.get("law"))
    try:
        temp_C, hours = float(req.get("temp_C", 85)), float(req.get("hours", 1000))
        frame_hz = float(req.get("frame_hz", 120))
    except (TypeError, ValueError):
        return {"ok": False, "errors": ["temp_C, hours, frame_hz는 숫자"]}
    if not (-40 <= temp_C <= 150 and 0 <= hours <= 1e6 and 1 <= frame_hz <= 240):
        errors.append("temp_C -40~150, hours 0~1e6, frame_hz 1~240")
    if kind not in ("driver", "pixel"):
        errors.append("kind는 driver 또는 pixel")
    if errors:
        return {"ok": False, "errors": errors}
    base = fresh(req.get("desc") or {})
    base["temp_C"] = temp_C
    if kind == "pixel":
        base["vth_check"] = False
        r = pixel.run(base)
        if not r["ok"]:
            return r
        s = r["series"]
        n = len(s["t_us"])
        rails = {k: float(base.get(k, pixel.PRESET[k])) for k in ("ELVDD", "ELVSS", "VINT", "VOBS")}
        rails["DATA"] = float(base.get("VDATA", pixel.PRESET["VDATA"]))
        get = lambda net: np.full(n, rails[net]) if net in rails else np.asarray(s[f"v({net})"])
        # ngspice steps are adaptive: weight every sample by its time span
        mask_w = np.gradient(np.asarray(s["t_us"]))
        tfts = {k: (1 if v.get("type", "P") == "P" else -1, v) for k, v in base["tft"].items()}
        note = "화소: 두 번째 프레임 파형(실제 프레임 시간)으로 스트레스를 계산"
    else:
        r = sim.run(base)
        if not r["ok"]:
            return r
        s, t = r["series"], r["timing"]
        tu = np.asarray(s["t_us"])
        n = len(tu)
        vgh, vgl = r["rails"]["VGH"], r["rails"]["VGL"]
        nets = {"VGH": np.full(n, vgh), "VGL": np.full(n, vgl), "GND": np.zeros(n),
                "CLK1": np.asarray(s["v(CLK1)"]), "CLK2": np.asarray(s["v(CLK2)"]),
                "IN": np.asarray(s["v(FLM)"]), "OUT": np.asarray(s["v(OUT1)"])}
        get = lambda net: nets[net] if net in nets else np.asarray(s[f"v(x1.{net.lower()})"])
        # stage 1 of frame 1: an active window around its own pulse, then a
        # hold window; weight them by their share of a real frame period
        f0 = t["T_s"] - t["P"]
        act = (tu >= f0) & (tu < t["T_s"] + 3 * t["P"])
        hold = (tu >= t["T_s"] + t["scan"]) & (tu < f0 + t["frame"])
        real_frame = 1e6 / frame_hz
        w_act = min(1.0, (4 * t["P"]) / real_frame)
        dt = np.gradient(tu)  # adaptive steps: weight samples by time span
        mask_w = (act * dt / max((act * dt).sum(), 1e-12) * w_act
                  + hold * dt / max((hold * dt).sum(), 1e-12) * (1 - w_act))
        tfts = {k: (1, v) for k, v in base["tft"].items()}
        note = (f"구동 회로: 1단의 자기 펄스 구간(4P)과 홀드 구간을 실제 프레임({real_frame:.0f} µs) "
                f"비율로 가중 (자기 구간 {w_act * 100:.2f}%)")
    out = {}
    for name, (pol, p) in tfts.items():
        a_on, a_off, duty, vov = _stress(get(p["G"]), get(p["S"]), get(p["D"]), pol, mask_w, law)
        out[name] = {"duty_on": round(duty, 4), "vgs_on_avg": round(vov, 3),
                     "acc_on": round(a_on, 5), "acc_off": round(a_off, 5),
                     **_degrade(a_on, a_off, hours, temp_C, law)}
    return {"ok": True, "kind": kind, "temp_C": temp_C, "hours": hours, "law": law,
            "tft": out, "note": note, "job": r["job"]}


# ---------------------------------------------------------------- margin maps
_jobs, _jobs_lock = {}, threading.Lock()
_pool = ThreadPoolExecutor(max_workers=6)
MAX_CELLS = 49


def _cell(kind, desc, vgh, vgl):
    d = copy.deepcopy(desc)
    d["VGH"], d["VGL"] = vgh, vgl
    if kind == "pixel":
        d["vth_check"] = False
        r = pixel.run(d)
        if not r["ok"]:
            return {"ok": False, "err": "; ".join(r.get("errors", []))[:200]}
        return {"ok": True, "I_em_nA": r["metrics"]["I_em_nA"]}
    r = sim.run(d)
    if not r["ok"]:
        return {"ok": False, "err": "; ".join(r.get("errors", []))[:200]}
    v = r["verdict"]
    return {"ok": True, "pass": v["pass"], "n_problems": len(v["problems"]),
            "first": v["problems"][0] if v["problems"] else ""}


def _prepare_variants(kind, desc, req_params):
    """Ensure fresh circuit has dVT=0 at 25C and aged circuit has per-TFT degradation at stress temperature."""
    fresh_d = fresh(desc)
    fresh_d["temp_C"] = 25.0

    temp_C = float(req_params.get("temp_C", 85.0))
    hours = float(req_params.get("hours", 3000.0))
    frame_hz = float(req_params.get("frame_hz", 120.0))
    law = req_params.get("law")

    # Check if desc already has significant per-TFT degradation explicitly set
    has_deg = False
    for p in desc.get("tft", {}).values():
        if abs(float(p.get("dVT", 0.0))) > 0.05 or abs(float(p.get("mu", 1.0)) - 1.0) > 0.02:
            has_deg = True
            break

    deg_info = {}
    if has_deg and not req_params.get("force_auto_age"):
        aged_d = copy.deepcopy(desc)
        aged_d["temp_C"] = temp_C
        for k, p in aged_d.get("tft", {}).items():
            deg_info[k] = {"dVT": float(p.get("dVT", 0.0)), "mu": float(p.get("mu", 1.0)),
                           "ss": float(p.get("ss", 1.0)), "ioff": float(p.get("ioff", 1.0))}
        source = f"사용자 설정 열화표 ({temp_C}°C 반영)"
    else:
        # Automatically compute stress and per-TFT degradation
        est = estimate({"kind": kind, "desc": desc, "temp_C": temp_C, "hours": hours,
                        "frame_hz": frame_hz, "law": law})
        aged_d = fresh(desc)
        aged_d["temp_C"] = temp_C
        if est.get("ok") and est.get("tft"):
            for k, deg in est["tft"].items():
                if k in aged_d.get("tft", {}):
                    aged_d["tft"][k].update({
                        "dVT": deg["dVT"],
                        "mu": deg["mu"],
                        "ss": deg["ss"],
                        "ioff": deg["ioff"],
                    })
                    deg_info[k] = {"dVT": deg["dVT"], "mu": deg["mu"],
                                   "ss": deg["ss"], "ioff": deg["ioff"]}
        source = f"스트레스 시뮬레이션 기반 자동 열화 ({temp_C}°C, {hours:g}시간, {frame_hz:g}Hz)"

    return fresh_d, aged_d, deg_info, source


def start_map(req):
    kind, desc = req.get("kind"), req.get("desc")
    if kind not in ("driver", "pixel") or not isinstance(desc, dict):
        return {"ok": False, "errors": ["kind(driver|pixel)와 desc가 필요"]}
    try:
        g = [np.linspace(float(a), float(b), int(c)) for a, b, c in (req["vgh"], req["vgl"])]
        tol = float(req.get("tol_pct", 5.0))
        temp_C = float(req.get("temp_C", 85.0))
        hours = float(req.get("hours", 3000.0))
        frame_hz = float(req.get("frame_hz", 120.0))
    except (KeyError, TypeError, ValueError):
        return {"ok": False, "errors": ["vgh, vgl은 [시작, 끝, 개수]"]}
    if len(g[0]) * len(g[1]) > MAX_CELLS or min(len(g[0]), len(g[1])) < 2:
        return {"ok": False, "errors": [f"격자는 2×2 이상 {MAX_CELLS}칸 이하"]}
    with _jobs_lock:
        if any(j["state"] == "running" for j in _jobs.values()):
            return {"ok": False, "errors": ["다른 마진 맵이 계산 중이에요. 끝난 뒤 다시."]}
        jid = "map_" + uuid.uuid4().hex[:8]
        vgh = [round(float(x), 3) for x in g[0]]
        vgl = [round(float(x), 3) for x in g[1]]
        job = {"state": "running", "kind": kind, "vgh": vgh, "vgl": vgl, "tol_pct": tol,
               "temp_C": temp_C, "hours": hours, "frame_hz": frame_hz,
               "done": 0, "total": 2 * len(vgh) * len(vgl), "started": time.time(),
               "aged": [[None] * len(vgl) for _ in vgh], "fresh": [[None] * len(vgl) for _ in vgh],
               "ref": None, "nominal": {"VGH": desc.get("VGH"), "VGL": desc.get("VGL")},
               "deg_info": {}, "aging_source": ""}
        _jobs[jid] = job
    threading.Thread(target=_run_map, args=(jid, kind, desc, req), daemon=True).start()
    return {"ok": True, "id": jid}


def _run_map(jid, kind, desc, req):
    job = _jobs[jid]
    fresh_d, aged_d, deg_info, source = _prepare_variants(kind, desc, req)
    job["deg_info"] = deg_info
    job["aging_source"] = source
    variants = {"aged": aged_d, "fresh": fresh_d}

    try:
        if kind == "pixel":  # reference current: fresh circuit at the nominal rails
            ref = pixel.run(dict(fresh(desc), vth_check=False))
            job["ref"] = ref["metrics"]["I_em_nA"] if ref.get("ok") else None
        futs = {}
        for which, d in variants.items():
            for (i, vh), (j, vl) in itertools.product(enumerate(job["vgh"]), enumerate(job["vgl"])):
                futs[_pool.submit(_cell, kind, d, vh, vl)] = (which, i, j)
        for f, (which, i, j) in futs.items():
            res = f.result()
            if kind == "pixel" and res.get("ok") and job["ref"]:
                ch = (res["I_em_nA"] / job["ref"] - 1) * 100
                res["change_pct"] = round(ch, 2)
                res["pass"] = abs(ch) <= job["tol_pct"]
            job[which][i][j] = res
            job["done"] += 1

        # Calculate pass counts
        fresh_passes = sum(1 for row in job["fresh"] for cell in row if cell and cell.get("pass"))
        aged_passes = sum(1 for row in job["aged"] for cell in row if cell and cell.get("pass"))
        total_cells = len(job["vgh"]) * len(job["vgl"])
        job["fresh_pass_count"] = fresh_passes
        job["aged_pass_count"] = aged_passes
        job["total_cells_per_map"] = total_cells
        job["margin_reduced"] = aged_passes < fresh_passes

        job["state"] = "done"
    except Exception as exc:  # keep the job visible with its error
        job["state"] = "error"
        job["error"] = f"{type(exc).__name__}: {exc}"[:300]
    job["elapsed_s"] = round(time.time() - job["started"], 1)
    with _jobs_lock:  # keep only the latest 20 jobs
        for k in list(_jobs)[:-20]:
            _jobs.pop(k, None)


def get_map(jid):
    job = _jobs.get(jid)
    return {"ok": True, **job} if job else {"ok": False, "errors": ["없는 작업"]}
