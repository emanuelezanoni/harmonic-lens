"""Score an app run (run_app.py timeline) against Praat reference segments of the same recording.
usage: score_own_voice.py TIMELINE.json SEGMENTS.json
Aligns wall-clock to audio time using the first F0 reading, then reports per vowel the median displayed
F1/F2 vs Praat, and how often formants are displayed OUTSIDE voiced segments (snaps, silence)."""
import json, re, sys, statistics as st

tl = json.load(open(sys.argv[1]))["timeline"]; segs = json.load(open(sys.argv[2]))
first = next(s["t"] for s in tl if re.search(r"\d+ Hz", s["pitch"]))
delta = first - segs[0]["start"] - 0.05          # audio time = wall time - delta (+- one analysis window)
def formants(s):
    return [int(v) for v in re.findall(r"F\d (\d+) Hz", s["formants"])]
labels = ["a", "e-open", "e-close", "i", "o-open", "o-close", "u"]
inside = outside = shown_in = shown_out = 0
for seg in segs:
    d = seg["end"] - seg["start"]; lo, hi = seg["start"] + 0.2 * d, seg["end"] - 0.2 * d
    got = [formants(s) for s in tl if lo <= s["t"] - delta <= hi and len(formants(s)) >= 2]
    f1 = st.median([g[0] for g in got]) if got else float("nan"); f2 = st.median([g[1] for g in got]) if got else float("nan")
    print(f"{labels[seg['i']]:8s} ref {seg['F1']}/{seg['F2']}  shown {f1:.0f}/{f2:.0f}  frames {len(got)}")
for s in tl:
    a = s["t"] - delta
    if a < segs[0]["start"] - 0.5 or a > segs[-1]["end"] + 0.5: continue
    in_seg = any(g["start"] <= a <= g["end"] for g in segs)
    if in_seg: inside += 1; shown_in += len(formants(s)) >= 2
    else: outside += 1; shown_out += len(formants(s)) >= 2
print(f"formants shown inside voiced segments: {100*shown_in/max(inside,1):.0f}%   outside (snaps/silence): {100*shown_out/max(outside,1):.1f}% of {outside} snapshots")
