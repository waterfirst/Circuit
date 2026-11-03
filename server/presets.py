"""Reference circuits. Pins follow odd-stage naming: CLK1 = own clock (CKA),
CLK2 = the other clock (CKB); even stages swap them automatically."""

_COMMON = {"VGH": 8.0, "VGL": -9.5, "freq_kHz": 250.0, "stages": 6, "frames": 2,
           "hold_us": 100.0, "clock_mode": "continuous"}

_7T = {
    "T1": {"G": "CLK1", "S": "IN", "D": "B", "W": 8, "L": 4.5},
    "T2": {"G": "B", "S": "VGH", "D": "A", "W": 4, "L": 6},
    "T3": {"G": "VGL", "S": "B", "D": "Q", "W": 4, "L": 4.5},
    "T4": {"G": "B", "S": "VGH", "D": "QB", "W": 4, "L": 4.5},
    "T5": {"G": "A", "S": "QB", "D": "B", "W": 4, "L": 6},
    "T6": {"G": "QB", "S": "VGH", "D": "OUT", "W": 40, "L": 4.5},
    "T7": {"G": "Q", "S": "OUT", "D": "CLK2", "W": 4, "L": 4.5},
}
_7T_CAPS = [{"a": "A", "b": "B", "pF": 1.0}, {"a": "Q", "b": "OUT", "pF": 0.2},
            {"a": "OUT", "b": "GND", "pF": 1.0}]

PRESETS = {
    "7T": {**_COMMON, "name": "7T (사용자 회로, QB 리셋 없음)", "tft": _7T, "caps": _7T_CAPS},
    "8T": {**_COMMON, "name": "8T (7T + T8: CLK1로 QB를 VGL로 리셋)",
           "tft": {**_7T, "T8": {"G": "CLK1", "S": "VGL", "D": "QB", "W": 2, "L": 4.5}},
           "caps": _7T_CAPS},
    "9T": {**_COMMON, "name": "9T (참고 회로)", "flm_lead_us": 0.5, "flm_lag_us": 0.5,
           "tft": {
               "T1": {"G": "CLK1", "S": "IN", "D": "B", "W": 8, "L": 4.5},
               "T2": {"G": "C", "S": "VGH", "D": "A", "W": 4, "L": 6},
               "T3": {"G": "CLK2", "S": "A", "D": "B", "W": 4, "L": 4.5},
               "T4": {"G": "B", "S": "VGH", "D": "C", "W": 4, "L": 4.5},
               "T5": {"G": "CLK1", "S": "QB", "D": "VGL", "W": 4, "L": 6},
               "T6": {"G": "QB", "S": "VGH", "D": "OUT", "W": 40, "L": 4.5},
               "T7": {"G": "Q", "S": "OUT", "D": "CLK2", "W": 4, "L": 4.5},
               "T8": {"G": "VGL", "S": "B", "D": "Q", "W": 4, "L": 4.5},
               "T9": {"G": "CLK2", "S": "QB", "D": "C", "W": 4, "L": 4.5}},
           "caps": [{"a": "VGH", "b": "QB", "pF": 1.0}, {"a": "OUT", "b": "Q", "pF": 0.2},
                    {"a": "OUT", "b": "GND", "pF": 1.0}]},
}

# EM driver stage: Samsung Display US 11,205,374 B2, first embodiment (12T3C).
# VDD -> VGH, VSS -> VGL; N7 = node between M1 and M2 (unnamed in the text).
# W/L and caps are not given in the patent: synthetic values chosen here.
_EM_TFT = {
    # M1/M2 at 20u: at 4u the CLK2 fall kicks N3 (and N1 via M3) down through
    # C1 faster than M1/M2 can clamp it, the latch flips and OUT never rises
    "T1": {"G": "N2", "S": "VGH", "D": "N7", "W": 20, "L": 4.5},    # M1
    "T2": {"G": "CLK2", "S": "N7", "D": "N3", "W": 20, "L": 4.5},   # M2
    "T3": {"G": "VGL", "S": "N1", "D": "N3", "W": 4, "L": 4.5},     # M3 always on
    "T4": {"G": "N4", "S": "VGH", "D": "OUT", "W": 30, "L": 4.5},   # M4 pull-up
    "T5": {"G": "N3", "S": "VGL", "D": "OUT", "W": 30, "L": 4.5},   # M5 pull-down
    "T6": {"G": "CLK1", "S": "IN", "D": "N1", "W": 4, "L": 4.5},    # M6 input
    "T7": {"G": "N1", "S": "CLK1", "D": "N2", "W": 4, "L": 4.5},    # M7
    "T8": {"G": "CLK1", "S": "VGL", "D": "N2", "W": 4, "L": 4.5},   # M8
    "T9": {"G": "VGL", "S": "N2", "D": "N5", "W": 4, "L": 4.5},     # M9 always on
    "T10": {"G": "CLK2", "S": "N6", "D": "N4", "W": 4, "L": 4.5},   # M10
    "T11": {"G": "N5", "S": "CLK2", "D": "N6", "W": 4, "L": 4.5},   # M11
    "T12": {"G": "N1", "S": "VGH", "D": "N4", "W": 4, "L": 4.5},    # M12
}
_EM_CAPS = [{"a": "N3", "b": "CLK2", "pF": 0.5}, {"a": "N5", "b": "N6", "pF": 0.5},
            {"a": "VGH", "b": "N4", "pF": 0.5}, {"a": "OUT", "b": "GND", "pF": 1.0}]
_HIGH = {**_COMMON, "output": "high_pulse", "start_lead_H": 0.5}

PRESETS["EM"] = {**_HIGH, "name": "EM 12T3C (US 11,205,374 B2)", "start_width_H": 8.0,
                 "tft": _EM_TFT, "caps": _EM_CAPS}

# GC / GI: LTPO pixels drive the oxide (n-type) T3/T4 with positive pulses.
# Assumption (not from one patent): reuse the EM-type stage above as the
# positive-pulse driver, with a narrower start pulse. In this stage the output
# is about 1H shorter than the start pulse (patent text: 4H start -> 3H).
PRESETS["GC"] = {**_HIGH, "name": "GC (보상 n-scan, EM형 단 재사용 · 가정)", "start_width_H": 4.0,
                 "tft": _EM_TFT, "caps": _EM_CAPS}
PRESETS["GI"] = {**_HIGH, "name": "GI (초기화 n-scan, EM형 단 재사용 · 가정)", "start_width_H": 2.0,
                 "tft": _EM_TFT, "caps": _EM_CAPS}
for _k, _v in (("7T", "GW 7T"), ("8T", "GW 8T"), ("9T", "GW 9T")):
    PRESETS[_k]["name"] = _v + PRESETS[_k]["name"][2:]
