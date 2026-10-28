"""Generate tests/formants-reference/reference.json: synthetic vowels + Praat
(parselmouth) Burg formants at chosen frame centres. Usage: python make_formant_reference.py OUT.json"""
import base64, json, sys
import numpy as np
from scipy.signal import lfilter
import parselmouth
from parselmouth.praat import call

WIN = 0.025
# name, vowel formants (Hz), bandwidths, fs, f0, maxFormant, noise SNR dB (None=clean)
MALE = {"a": (730, 1090, 2440, 3400, 4300), "i": (270, 2290, 3010, 3600, 4400), "u": (300, 870, 2240, 3400, 4300)}
BW = (60, 90, 120, 150, 200)
CASES = []
for v in "aiu":
    CASES.append((f"male_{v}_clean", MALE[v], 48000, 120, 5500, None))
CASES.append(("male_u_44k", MALE["u"], 44100, 110, 5500, None))
CASES.append(("male_a_noisy", MALE["a"], 48000, 130, 5500, 20))
CASES.append(("male_i_noisy", MALE["i"], 48000, 140, 5500, 20))
FEM = {"a": (850, 1220, 2810, 3900, 4900), "i": (310, 2790, 3310, 4000, 4900)}
for v in "ai":
    CASES.append((f"female_{v}_f0_220", FEM[v], 48000, 220, 5500, None))
CASES.append(("child_a_f0_300", tuple(int(f * 1.3) for f in MALE["a"]), 48000, 300, 7000, None))
CASES.append(("child_i_f0_300", tuple(int(f * 1.3) for f in MALE["i"]), 48000, 300, 7000, None))

def synth(forms, fs, f0, dur, snr, rng):
    n = int(dur * fs)
    ph = np.cumsum(np.full(n, f0 / fs))
    src = np.zeros(n); src[1:] = (np.floor(ph[1:]) != np.floor(ph[:-1]))
    y = lfilter([1], [1, -0.97], src)
    for f, bw in zip(forms, BW):
        r = np.exp(-np.pi * bw / fs); th = 2 * np.pi * f / fs
        y = lfilter([1 - 2 * r * np.cos(th) + r * r], [1, -2 * r * np.cos(th), r * r], y)
    y = 0.3 * y / np.max(np.abs(y))
    if snr is not None:
        y = y + rng.standard_normal(n) * np.sqrt(np.mean(y ** 2) / 10 ** (snr / 10))
        y = 0.3 * y / np.max(np.abs(y))
    return y

def main(out):
    rng = np.random.default_rng(1234)
    res = []
    for name, forms, fs, f0, maxf, snr in CASES:
        y = synth(forms, fs, f0, 1.0, snr, rng)
        snd = parselmouth.Sound(y, sampling_frequency=fs)
        fm = call(snd, "To Formant (burg)", 0.01, 5, maxf, WIN, 50)
        nin = round(2 * WIN * fs)
        frames = []
        for t in (0.3, 0.42, 0.55, 0.67, 0.8):
            tt = call(fm, "Get time from frame number", round(call(fm, "Get frame number from time", t)))
            pf = []
            for k in range(1, 5):
                f = call(fm, "Get value at time", k, tt, "Hertz", "Linear")
                b = call(fm, "Get bandwidth at time", k, tt, "Hertz", "Linear")
                if np.isfinite(f): pf.append([round(f, 2), round(b, 2)])
            i0 = int(round(tt * fs - nin / 2))
            seg = np.round(y[i0:i0 + nin] * 32767).astype("<i2")
            frames.append({"t": tt, "samples": base64.b64encode(seg.tobytes()).decode(), "praat": pf})
        res.append({"name": name, "sampleRate": fs, "options": {"maxFormantHz": maxf, "formantCount": 5, "windowLengthS": WIN, "preEmphasisFromHz": 50}, "truth": list(forms), "frames": frames})
    json.dump({"praat": parselmouth.PRAAT_VERSION, "cases": res}, open(out, "w"))

main(sys.argv[1])
