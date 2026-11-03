"""Self-check for a fresh install. Run from server/: python tests/selfcheck.py
Expected values come from the reference machine (ngspice 45.2, OpenVAF-reloaded,
ptft_fit.va in models/). Small numeric drift on another build is acceptable;
PASS/FAIL outcomes must match."""
import copy, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import aging, pixel, presets, sim  # noqa: E402

ok = True


def check(name, cond, detail=""):
    global ok
    ok &= bool(cond)
    print(f"[{'PASS' if cond else 'FAIL'}] {name} {detail}")


t0 = time.time()
want = {"7T": False, "8T": True, "9T": True, "EM": True, "GC": True, "GI": True}
for k, exp in want.items():
    r = sim.run(presets.PRESETS[k])
    check(f"preset {k} verdict == {'PASS' if exp else 'FAIL'}", r.get("ok") and r["verdict"]["pass"] == exp,
          "" if r.get("ok") else str(r.get("errors")))

for w, H in [(2, 4.0), (4, 4.0), (8, 4.0)]:
    d = dict(presets.PRESETS["EM"], start_width_H=w)
    r = sim.run(d)
    widths = {s["width_us"] for s in r["verdict"]["stages"]}
    check(f"EM start {w}H -> output about {(w - 1) * H:.0f} us", all(abs(x - (w - 1) * H) < 0.5 for x in widths), str(widths))

cur = []
for v in (2.0, 3.0, 4.0):
    cur.append(pixel.run(dict(pixel.PRESET, VDATA=v, vth_check=False))["metrics"]["I_em_nA"])
check("pixel current falls with DATA 2/3/4 V", cur[0] > cur[1] > cur[2], str(cur))
check("pixel current at DATA 3 V about 749 nA", abs(cur[1] - 749.4) < 20, f"{cur[1]:.1f}")
r = pixel.run(pixel.PRESET)
chg = [x["I_change_pct"] for x in r["vth_check"]]
check("pixel Vth compensation: T1 dVth +-0.2 V changes current < 3 %", max(abs(x) for x in chg) < 3, str(chg))

d = copy.deepcopy(presets.PRESETS["8T"])
d["tft"]["T1"].update({"dVT": 3, "mu": 0.3})
check("8T with aged T1 (dVth +3 V, Ion x0.3) fails at VGL -9.5 V", not sim.run(d)["verdict"]["pass"])
d["VGL"] = -13
check("... and recovers at VGL -13 V", sim.run(d)["verdict"]["pass"])
e = aging.estimate({"kind": "driver", "desc": presets.PRESETS["8T"], "temp_C": 85, "hours": 3000})
check("aging estimate runs; T6 (hold pull-up) is among the most stressed", e.get("ok") and e["tft"]["T6"]["dVT"] > 1.0,
      str(e.get("tft", {}).get("T6")))

j = aging.start_map({"kind": "driver", "desc": presets.PRESETS["8T"], "vgh": [6, 10, 2], "vgl": [-12, -8, 2]})
while aging.get_map(j["id"])["state"] == "running":
    time.sleep(0.5)
m = aging.get_map(j["id"])
check("2x2 margin map completes", m["state"] == "done" and all(c and c["ok"] for row in m["aged"] for c in row))

bad = sim.run({"tft": {"T1": {"G": "CLK1", "S": "IN; rm -rf /", "D": "B"}}})
check("shell characters in a node name are rejected", not bad["ok"])
check("out-of-range VGH is rejected", not sim.run(dict(presets.PRESETS["8T"], VGH=99))["ok"])

print(f"\n{'ALL PASS' if ok else 'SOME CHECKS FAILED'}  ({time.time() - t0:.1f} s)")
sys.exit(0 if ok else 1)
