import assert from "node:assert/strict";
import test from "node:test";
import { FormantTracker } from "../src/dsp/formants/tracker";

const f = (...pairs: [number, number][]) => pairs.map(([frequencyHz, bandwidthHz]) => ({ frequencyHz, bandwidthHz }));
const hz = (out: { frequencyHz: number }[]) => out.map((x) => Math.round(x.frequencyHz));

test("tracker: clean poles map to F1..F4 in order", () => {
  const t = new FormantTracker();
  const out = t.update(f([700, 80], [1200, 100], [2500, 150], [3500, 200], [4600, 300]));
  assert.deepEqual(hz(out), [700, 1200, 2500, 3500]);
});

test("tracker: a spurious wide pole between formants does not shift the labels", () => {
  const t = new FormantTracker();
  for (let i = 0; i < 5; i++) t.update(f([700, 80], [1200, 100], [2500, 150], [3500, 200]));
  const out = t.update(f([705, 80], [1210, 100], [1900, 3500], [2490, 150], [3510, 200]));
  assert.deepEqual(hz(out).map((v) => Math.round(v / 20) * 20), [700, 1200, 2500, 3500]);
});

test("tracker: a short dropout of one pole is bridged, a long one is not", () => {
  const t = new FormantTracker();
  for (let i = 0; i < 5; i++) t.update(f([700, 80], [1200, 100], [2500, 150]));
  const bridged = t.update(f([700, 80], [2500, 150]));
  assert.equal(bridged.length, 3);
  let last = bridged;
  for (let i = 0; i < 6; i++) last = t.update(f([700, 80]));
  assert.equal(last.length, 1);
});

test("tracker: unvoiced frames leave no history behind", () => {
  const t = new FormantTracker();
  t.update(f([1100, 300], [3000, 400], [4200, 500]), false);
  t.update(f([1100, 300], [3000, 400], [4200, 500]), false);
  const out = t.update(f([650, 80], [1100, 100], [2800, 150]), true);
  assert.deepEqual(hz(out), [650, 1100, 2800]);
});

test("tracker: follows a glide and median-filters a single-frame outlier", () => {
  const t = new FormantTracker();
  let out = t.update(f([400, 60], [2000, 100], [3000, 150]));
  for (let i = 1; i <= 10; i++) out = t.update(f([400 + 25 * i, 60], [2000 - 40 * i, 100], [3000, 150]));
  assert.ok(Math.abs(out[0].frequencyHz - 650) < 40 && Math.abs(out[1].frequencyHz - 1600) < 60);
  const before = out[0].frequencyHz;
  t.update(f([650, 60], [1600, 100], [3000, 150]));
  const glitch = t.update(f([1000, 60], [1600, 100], [3000, 150]));
  assert.ok(Math.abs(glitch[0].frequencyHz - before) < 80, "single-frame jump must not reach the output");
});

test("tracker: empty input returns nothing and reset forgets history", () => {
  const t = new FormantTracker();
  assert.deepEqual(t.update([]), []);
  t.update(f([700, 80], [1200, 100]));
  t.reset();
  assert.deepEqual(hz(t.update(f([300, 50], [2300, 100]))), [300, 2300]);
});
