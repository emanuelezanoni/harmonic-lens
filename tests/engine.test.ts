import assert from "node:assert/strict";
import test from "node:test";
import { AnalysisEngine, PitchTracker, type FrameResult } from "../src/dsp/engine";
import { loadPraatPitchModule, PraatPitchHarmonicity } from "../src/dsp/praat-wasm";
import { SpectrumAnalyzer } from "../src/dsp/spectrum";

let sr = 48000;
const wasmUrl = new URL("../public/praat-wasm/praat-pitch-harmonicity.js", import.meta.url).href;
const noFormants = { estimate: () => [] };

/** Harmonic tone: partial k has amplitude 1/k, phase continuous through an F0 glide. */
function tone(seconds: number, f0At: (t: number) => number, partials = 12): Float32Array {
  const out = new Float32Array(Math.round(seconds * sr));
  let phase = 0;
  for (let i = 0; i < out.length; i += 1) {
    phase += (2 * Math.PI * f0At(i / sr)) / sr;
    let v = 0;
    for (let k = 1; k <= partials; k += 1) v += Math.sin(k * phase) / k;
    out[i] = 0.15 * v;
  }
  return out;
}

async function run(signal: Float32Array, block = 128): Promise<FrameResult[]> {
  const praat = new PraatPitchHarmonicity(await loadPraatPitchModule(wasmUrl));
  const engine = new AnalysisEngine({ sampleRate: sr }, praat, noFormants);
  const frames: FrameResult[] = [];
  for (let i = 0; i + block <= signal.length; i += block) {
    const frame = engine.push(signal.subarray(i, i + block));
    if (frame) frames.push(frame);
  }
  praat.dispose();
  return frames;
}

test("steady voice: F0, HNR and harmonic peaks come out of the real Praat WASM", async () => {
  const frames = await run(tone(1.0, () => 130));
  assert.ok(frames.length > 80, `expected ~10ms hops, got ${frames.length}`);
  const settled = frames.slice(10);
  for (const frame of settled) {
    assert.ok(frame.f0Hz !== null && Math.abs(frame.f0Hz - 130) < 0.5, `f0 ${frame.f0Hz}`);
    assert.ok(frame.hnrDb !== null && frame.hnrDb > 10, `hnr ${frame.hnrDb}`);
    for (let k = 1; k <= 8; k += 1) {
      const peak = frame.peaks[k - 1];
      assert.ok(peak && Math.abs(peak.frequencyHz - 130 * k) < 3, `H${k} ${peak?.frequencyHz}`);
    }
  }
});

test("gliding voice is tracked within 1 Hz of the glide", async () => {
  const f0At = (t: number) => 110 + 60 * t; // 110 -> 170 Hz over 1 s
  const frames = await run(tone(1.0, f0At));
  const errors = frames.slice(10).map((f) => Math.abs((f.f0Hz ?? 0) - f0At(f.timeS - 0.02)));
  const worst = Math.max(...errors);
  assert.ok(worst < 2.5, `worst glide error ${worst.toFixed(2)} Hz`);
});

test("silence yields no pitch, formants or peaks", async () => {
  const frames = await run(new Float32Array(sr / 2));
  assert.ok(frames.length > 0);
  for (const frame of frames) {
    assert.equal(frame.f0Hz, null);
    assert.deepEqual(frame.formants, []);
    assert.ok(frame.peaks.every((p) => p === null));
  }
});

test("engine emits at most one frame per push and keeps a steady hop", async () => {
  const frames = await run(tone(0.5, () => 150), 480);
  const gaps = frames.slice(1).map((f, i) => f.timeS - frames[i].timeS);
  assert.ok(gaps.every((g) => Math.abs(g - 0.01) < 1e-9), "hop must be exactly 10 ms with 480-sample blocks");
});

test("spectrum places a pure tone in the right row", () => {
  const analyzer = new SpectrumAnalyzer(sr, { windowS: 0.01, maxHz: 5000, rows: 250 });
  const samples = new Float32Array(analyzer.windowSamples);
  for (let i = 0; i < samples.length; i += 1) samples[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / sr);
  const out = new Float32Array(250);
  analyzer.compute(samples, out);
  const peakRow = out.indexOf(Math.max(...out));
  assert.ok(Math.abs(peakRow - 50) <= 2, `1 kHz should sit near row 50 (20 Hz/row), got ${peakRow}`);
});

test("pitch tracker bridges short gaps and rejects isolated octave jumps", () => {
  const tracker = new PitchTracker();
  assert.equal(tracker.update(120), 120);
  assert.equal(tracker.update(null), 120);
  assert.equal(tracker.update(null), 120);
  assert.equal(tracker.update(null), null);
  tracker.update(120);
  assert.equal(tracker.update(240), 120);
  assert.equal(tracker.update(121), 121);
  tracker.update(240); tracker.update(240);
  assert.equal(tracker.update(240), 240);
});

/** Source-filter vowel: impulse train through spectral tilt and cascaded resonators. */
function vowel(seconds: number, f0: number, formants: number[], bandwidths = [60, 90, 120]): Float32Array {
  const n = Math.round(seconds * sr);
  let x = new Float64Array(n);
  let phase = 0, previous = 0;
  for (let i = 0; i < n; i += 1) {
    phase += f0 / sr;
    const pulse = Math.floor(phase) !== Math.floor(phase - f0 / sr) ? 1 : 0;
    previous = pulse + 0.97 * previous;
    x[i] = previous;
  }
  formants.forEach((f, k) => {
    const r = Math.exp((-Math.PI * bandwidths[k]) / sr), c = -2 * r * Math.cos((2 * Math.PI * f) / sr), g = 1 + c + r * r;
    const y = new Float64Array(n);
    for (let i = 0; i < n; i += 1) y[i] = g * x[i] - c * (y[i - 1] ?? 0) - r * r * (y[i - 2] ?? 0);
    x = y;
  });
  const peak = Math.max(...x.map(Math.abs));
  return Float32Array.from(x, (v) => (0.3 * v) / peak);
}

test("engine reports Praat-like formants and F0 for synthetic vowels", async () => {
  const { FormantEstimator } = await import("../src/dsp/formants");
  const cases: [string, number[], number][] = [["a", [730, 1090, 2440], 120], ["i", [270, 2290, 3010], 140], ["u", [300, 870, 2240], 110]];
  for (const [name, formants, f0] of cases) {
    const praat = new PraatPitchHarmonicity(await loadPraatPitchModule(wasmUrl));
    const engine = new AnalysisEngine({ sampleRate: sr }, praat, new FormantEstimator(sr, { maxFormantHz: 5000, formantCount: 4 }));
    const signal = vowel(0.8, f0, formants);
    let last: FrameResult | null = null;
    for (let i = 0; i + 128 <= signal.length; i += 128) last = engine.push(signal.subarray(i, i + 128)) ?? last;
    assert.ok(last, name);
    assert.ok(last.f0Hz !== null && Math.abs(last.f0Hz - f0) < 1, `${name} f0 ${last.f0Hz}`);
    const found = last.formants.map((f) => f.frequencyHz);
    // A low F1 (here u: 300 Hz vs 110 Hz F0) is pulled toward the nearest harmonic, as in Praat itself: 12% tolerance.
    for (const target of formants.slice(0, 2)) {
      assert.ok(found.some((f) => Math.abs(f - target) / target < 0.12), `${name}: no formant near ${target} Hz in ${found.map(Math.round)}`);
    }
    praat.dispose();
  }
});

test("engine works at 44.1 kHz and 16 kHz capture rates", async () => {
  const original = sr;
  try {
    for (const rate of [44100, 16000]) {
      sr = rate;
      const frames = await run(tone(0.6, () => 200));
      const last = frames.at(-1);
      assert.ok(last && last.f0Hz !== null && Math.abs(last.f0Hz - 200) < 1, `${rate} Hz: f0 ${last?.f0Hz}`);
      assert.ok(last.hnrDb !== null, `${rate} Hz: hnr`);
      assert.equal(last.spectrum.length, 256);
    }
  } finally { sr = original; }
});
