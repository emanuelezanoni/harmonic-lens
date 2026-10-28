"""Concatenate Hillenbrand (1995) tokens into a fake-mic WAV plus a truth sidecar (measured steady-state formants).
usage: make_real_vowels.py DATA_DIR OUT_PREFIX id1 id2 ..."""
import json, sys, wave
import numpy as np
from scipy.signal import resample_poly

data, out, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
ref = {}
for line in open(f"{data}/vowdata.dat"):
    p = line.split()
    if len(p) >= 7 and p[0][0] in "mwbg" and p[0][1:3].isdigit(): ref[p[0]] = [float(x) for x in p[2:6]]
folder = {"m": "men", "w": "women", "b": "kids", "g": "kids"}
parts, truth, t = [], [], 0.0
gap = np.zeros(16000 // 2)  # 0.5 s of silence between tokens
parts.append(gap); t += 0.5
for i in ids:
    w = wave.open(f"{data}/{folder[i[0]]}/{i}.wav")
    x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(float) / 32768
    parts += [x, gap]
    truth.append({"id": i, "start": t, "end": t + len(x) / 16000, "f0": ref[i][0], "formants": ref[i][1:4]})
    t += len(x) / 16000 + 0.5
y = np.concatenate(parts)
y = resample_poly(y, 3, 1)  # 16 -> 48 kHz
y = 0.5 * y / np.max(np.abs(y))
with wave.open(out + ".wav", "wb") as o:
    o.setnchannels(1); o.setsampwidth(2); o.setframerate(48000)
    o.writeframes((y * 32767).astype("<i2").tobytes())
json.dump({"duration": t, "tokens": truth}, open(out + ".truth.json", "w"), indent=1)
print("duration", round(t, 1), "tokens", len(ids))
