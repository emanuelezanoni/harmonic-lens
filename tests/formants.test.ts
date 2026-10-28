import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FormantEstimator, type FormantOptions } from "../src/dsp/formants/index";

type RefFrame = { t: number; samples: string; praat: [number, number][] };
type RefCase = { name: string; sampleRate: number; options: FormantOptions; truth: number[]; frames: RefFrame[] };
const ref = JSON.parse(readFileSync(new URL("./formants-reference/reference.json", import.meta.url), "utf8")) as { cases: RefCase[] };

function decode(b64: string): Float32Array {
  const buf = Buffer.from(b64, "base64");
  const i16 = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
  const out = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) out[i] = i16[i] / 32768;
  return out;
}
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

// Clean synthetic vowels: median relative F1-F3 error vs Praat must be < 3%.
// Noisy cases are looser (noise perturbs Praat's own estimate; frames are resampled
// per-frame here vs whole-sound in Praat).
for (const c of ref.cases) {
  const noisy = c.name.includes("noisy");
  const medTol = noisy ? 0.05 : 0.03;
  test(`formants vs Praat: ${c.name}`, () => {
    const est = new FormantEstimator(c.sampleRate, c.options);
    const errs: number[][] = [[], [], []];
    for (const fr of c.frames) {
      const got = est.estimate(decode(fr.samples));
      for (let k = 0; k < 3; k++) {
        if (!got[k] || !fr.praat[k]) { errs[k].push(1); continue; }
        errs[k].push(Math.abs(got[k].frequencyHz - fr.praat[k][0]) / fr.praat[k][0]);
      }
    }
    const all = errs.flat();
    console.log(`  ${c.name}: median ${(median(all) * 100).toFixed(2)}% max ${(Math.max(...all) * 100).toFixed(2)}% (F1 ${(median(errs[0]) * 100).toFixed(2)} F2 ${(median(errs[1]) * 100).toFixed(2)} F3 ${(median(errs[2]) * 100).toFixed(2)})`);
    assert.ok(median(all) < medTol, `median ${median(all)}`);
    assert.ok(Math.max(...all) < 0.1, `max ${Math.max(...all)}`);
  });
}

test("silence yields no formants", () => {
  const est = new FormantEstimator(48000);
  assert.deepEqual(est.estimate(new Float32Array(2400)), []);
  assert.deepEqual(est.estimate(new Float32Array(4000)), []);
});

test("sine / noise / short input do not crash and are sorted", () => {
  for (const fs of [44100, 48000]) {
    const est = new FormantEstimator(fs);
    const n = Math.round(0.05 * fs);
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) s[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / fs);
    const r = est.estimate(s);
    for (let i = 1; i < r.length; i++) assert.ok(r[i].frequencyHz >= r[i - 1].frequencyHz);
    for (let i = 0; i < n; i++) s[i] = Math.random() - 0.5;
    assert.ok(est.estimate(s).length <= 5);
    assert.deepEqual(est.estimate(new Float32Array(10)), []);
  }
});

test("perf: < 1 ms per frame at 48 kHz, N=2400", () => {
  const c = ref.cases[0];
  const est = new FormantEstimator(48000, c.options);
  const x = decode(c.frames[0].samples);
  for (let i = 0; i < 200; i++) est.estimate(x);
  const iters = 2000;
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) est.estimate(x);
  const ms = (performance.now() - t0) / iters;
  console.log(`  perf: ${ms.toFixed(3)} ms/frame`);
  assert.ok(ms < 1.0, `${ms} ms`);
});
