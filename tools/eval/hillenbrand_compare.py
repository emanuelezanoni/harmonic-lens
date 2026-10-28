"""Compare engine vs Hillenbrand measurements vs Praat (parselmouth) at each token's steady state.
usage: hillenbrand_compare.py DATA_DIR ENGINE.json"""
import json, sys, collections
import numpy as np
import parselmouth

data, engine_path = sys.argv[1], sys.argv[2]
ref = {}
for line in open(f"{data}/vowdata.dat"):
    p = line.split()
    if len(p) >= 7 and p[0][0] in "mwbg" and p[0][1:3].isdigit():
        ref[p[0]] = [float(p[3]), float(p[4]), float(p[5])]
folder = {"m": "men", "w": "women", "b": "kids", "g": "kids"}
rows = json.load(open(engine_path))
err = collections.defaultdict(lambda: {"mine": [], "praat": [], "mp": []})
for r in rows:
    i = r["id"]; truth = ref.get(i)
    if not truth or 0 in truth: continue
    snd = parselmouth.Sound(f"{data}/{folder[i[0]]}/{i}.wav")
    fo = snd.to_formant_burg(time_step=0.005, max_number_of_formants=5, maximum_formant=r["maxFormant"], window_length=0.025, pre_emphasis_from=50)
    praat = [fo.get_value_at_time(k, r["t"]) for k in (1, 2, 3)]
    mine = (r["formants"] + [float("nan")] * 3)[:3]
    for k in range(3):
        g = i[0]
        if np.isfinite(mine[k]): err[(g, k)]["mine"].append(abs(mine[k] - truth[k]) / truth[k])
        else: err[(g, k)]["mine"].append(1.0)
        if np.isfinite(praat[k]): err[(g, k)]["praat"].append(abs(praat[k] - truth[k]) / truth[k])
        else: err[(g, k)]["praat"].append(1.0)
        if np.isfinite(mine[k]) and np.isfinite(praat[k]): err[(g, k)]["mp"].append(abs(mine[k] - praat[k]) / praat[k])
names = {"m": "men", "w": "women", "b": "boys", "g": "girls"}
print("median |err| vs Hillenbrand; share within 10%; engine-vs-Praat median")
for g in "mwbg":
    for k in range(3):
        e = err.get((g, k))
        if not e: continue
        m, p, mp = np.array(e["mine"]), np.array(e["praat"]), np.array(e["mp"])
        print(f"{names[g]:6} F{k+1}: engine {100*np.median(m):5.1f}% (<10%: {100*np.mean(m<0.1):4.0f}%) | Praat {100*np.median(p):5.1f}% (<10%: {100*np.mean(p<0.1):4.0f}%) | engine vs Praat {100*np.median(mp):4.1f}%  n={len(m)}")
f0 = [(r["id"], r["f0"]) for r in rows]
print("f0 present:", sum(1 for _, v in f0 if v), "/", len(f0))
