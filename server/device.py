"""TFT model card with temperature and degradation applied.

The OSDI model (ptft_fit) has no temperature term (thermal voltage fixed at
300 K), so temperature and aging are applied here by rewriting card values.
All coefficients are synthetic assumptions, editable by the caller:

- Ioff: GOFF x exp(Ea_off/k (1/T0 - 1/T)), Ea_off = 0.35 eV
  (gives about x10 from 25 to 85 C, matching the operator's LTPS measurement)
- SS:   x T/T0 (diffusion-limited subthreshold slope scales with kT)
- Vth:  |Vth| (p-type) / Vth (n-type) falls 2 mV/K
- Ion:  mobility unchanged with temperature (not modeled)
Degradation is per TFT: dVT [V] (+ = harder to turn on), mu (Ion scale),
ioff (Ioff scale), ss (SS scale).
"""
import math

K_B = 8.617e-5
T0_C = 25.0
BASE = {"SS": 0.3, "GOFF": 1e-14}
TEMP = {"Ea_off_eV": 0.35, "dVth_dT": -0.002}
DEG_KEYS = {"dVT": (0.0, -2.0, 3.0), "mu": (1.0, 0.05, 3.0),
            "ioff": (1.0, 0.01, 1e4), "ss": (1.0, 0.3, 5.0)}


def read_deg(p, name, errors):
    """Parse per-TFT degradation fields (with defaults) into a dict."""
    out = {}
    for k, (d, lo, hi) in DEG_KEYS.items():
        try:
            v = float(p.get(k, d))
        except (TypeError, ValueError):
            errors.append(f"{name}.{k}: 숫자가 아님"); v = d
        if not lo <= v <= hi:
            errors.append(f"{name}.{k}={v} 범위 밖 ({lo}~{hi})")
        out[k] = v
    return out


def read_temp(desc, errors):
    try:
        t = float(desc.get("temp_C", T0_C))
    except (TypeError, ValueError):
        errors.append("temp_C: 숫자가 아님"); return T0_C
    if not -40 <= t <= 150:
        errors.append(f"temp_C={t} 범위 밖 (-40~150)")
    return t


def card(name, pol, W, L, VT0, U0, deg, temp_C):
    """One .model line. pol: +1 p-type LTPS, -1 n-type oxide."""
    T, T0 = temp_C + 273.15, T0_C + 273.15
    goff = BASE["GOFF"] * deg["ioff"] * math.exp(TEMP["Ea_off_eV"] / K_B * (1 / T0 - 1 / T))
    ss = BASE["SS"] * deg["ss"] * T / T0
    vt0 = max(0.0, VT0 + TEMP["dVth_dT"] * (temp_C - T0_C)) + deg["dVT"]
    u0 = U0 * deg["mu"]
    return (f".model m{name} ptft_fit W={W}u L={L}u VT0={vt0:.4f} U0={u0:.3f} "
            f"SS={ss:.4f} GOFF={goff:.4e} POL={pol}")
