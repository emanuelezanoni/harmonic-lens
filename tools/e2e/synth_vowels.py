"""Synthetic vowel test signal with known ground truth (source-filter model).

Writes a 16-bit mono WAV (loopable fake-mic input for Chromium) and a JSON
ground-truth file. Glottal source: impulse train through a one-pole low-pass
(spectral tilt); vocal tract: cascade of 2nd-order resonators.
"""
import json, sys
import numpy as np
from scipy.signal import lfilter
from scipy.io import wavfile

SR = 48000
VOWELS = {  # Hz, Peterson & Barney-ish male
    "a": (730, 1090, 2440),
    "i": (270, 2290, 3010),
    "u": (300, 870, 2240),
}
BW = (60, 90, 120)
SEG_S = 2.5

def resonator(f, bw):
    r = np.exp(-np.pi * bw / SR)
    th = 2 * np.pi * f / SR
    return [1 - 2 * r * np.cos(th) + r * r], [1, -2 * r * np.cos(th), r * r]

def segment(vowel, f0_start, f0_end):
    n = int(SEG_S * SR)
    f0 = np.linspace(f0_start, f0_end, n)
    phase = np.cumsum(f0 / SR)
    src = np.zeros(n)
    src[1:] = (np.floor(phase[1:]) != np.floor(phase[:-1])).astype(float)
    src = lfilter([1], [1, -0.97], src)  # spectral tilt
    y = src
    for f, bw in zip(VOWELS[vowel], BW):
        b, a = resonator(f, bw)
        y = lfilter(b, a, y)
    fade = np.minimum(1, np.minimum(np.arange(n), n - np.arange(n)) / (0.05 * SR))
    return y * fade, f0

def main(out_prefix):
    parts, truth = [], []
    t = 0.0
    for vowel, (a, b) in (("a", (120, 120)), ("i", (140, 140)), ("u", (110, 170))):
        y, f0 = segment(vowel, a, b)
        parts.append(y)
        truth.append({"vowel": vowel, "start": t, "end": t + SEG_S, "f0": [float(f0[0]), float(f0[-1])], "formants": VOWELS[vowel]})
        t += SEG_S
    x = np.concatenate(parts)
    x = 0.3 * x / np.max(np.abs(x))
    wavfile.write(out_prefix + ".wav", SR, (x * 32767).astype(np.int16))
    json.dump({"sampleRate": SR, "segments": truth}, open(out_prefix + ".json", "w"), indent=2)

if __name__ == "__main__":
    main(sys.argv[1])
