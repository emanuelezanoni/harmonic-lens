// Natural-speech check: streaming estimator+tracker vs Praat Burg tracks (no hand-labelled truth exists for
// running speech, so this measures agreement and track stability, not accuracy).
// usage: node --import tsx tools/bench/speech-vs-praat.ts WAV16K PRAAT.json
import { readFileSync } from "node:fs";
import { FormantEstimator } from "../../src/dsp/formants/index";
import { FormantTracker } from "../../src/dsp/formants/tracker";

const [wavPath, praatPath] = process.argv.slice(2);
const praat = JSON.parse(readFileSync(praatPath, "utf8")) as { maxFormantHz: number; rows: number[][] };
const b = readFileSync(wavPath);
const x = new Float32Array((b.length - 44) >> 1);
for (let i = 0; i < x.length; i++) x[i] = b.readInt16LE(44 + 2 * i) / 32768;
const fs = 16000, win = 800;
const est = new FormantEstimator(fs, { maxFormantHz: praat.maxFormantHz });
const trk = new FormantTracker({ maxFormantHz: praat.maxFormantHz });

type Stat = { frames: number; agree: number[]; mineJumps: number; praatJumps: number; pairs: number; mineGone: number };
const st: Stat = { frames: 0, agree: [0, 0, 0], mineJumps: 0, praatJumps: 0, pairs: 0, mineGone: 0 };
let prevMine: number[] | null = null, prevPraat: number[] | null = null, run = 0;
for (const [t, f0, p1, p2, p3] of praat.rows) {
  const e = Math.round(t * fs) + win / 2;
  const voiced = f0 > 0;
  if (!voiced || e - win < 0 || e > x.length) { if (!voiced) trk.update([], false); prevMine = prevPraat = null; run = 0; continue; }
  const out = trk.update(est.estimate(x.subarray(e - win, e)), true);
  run++;
  if (run < 3) { prevMine = prevPraat = null; continue; } // same 3-frame onset rule as the engine
  const mine = [out[0]?.frequencyHz ?? 0, out[1]?.frequencyHz ?? 0, out[2]?.frequencyHz ?? 0], pr = [p1, p2, p3];
  st.frames++;
  for (let k = 0; k < 3; k++) { if (mine[k] > 0 && pr[k] > 0 && Math.abs(mine[k] / pr[k] - 1) < 0.1) st.agree[k]++; }
  if (mine[1] === 0) st.mineGone++;
  if (prevMine && prevPraat) {
    st.pairs++;
    if (mine[1] > 0 && prevMine[1] > 0 && Math.abs(mine[1] / prevMine[1] - 1) > 0.25) st.mineJumps++;
    if (pr[1] > 0 && prevPraat[1] > 0 && Math.abs(pr[1] / prevPraat[1] - 1) > 0.25) st.praatJumps++;
  }
  prevMine = mine; prevPraat = pr;
}
const pct = (n: number, d: number) => ((100 * n) / d).toFixed(1) + "%";
console.log(`${wavPath.split("/").pop()}: voiced frames ${st.frames}`);
console.log(`  agree with Praat within 10%:  F1 ${pct(st.agree[0], st.frames)}  F2 ${pct(st.agree[1], st.frames)}  F3 ${pct(st.agree[2], st.frames)}`);
console.log(`  F2 jumps >25% per 10 ms:       mine ${pct(st.mineJumps, st.pairs)}   praat ${pct(st.praatJumps, st.pairs)}`);
console.log(`  frames where mine shows no F2: ${pct(st.mineGone, st.frames)}`);
