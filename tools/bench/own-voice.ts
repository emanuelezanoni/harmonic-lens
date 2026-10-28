// Compare the streaming estimator+tracker against Praat reference values on a segmented own-voice recording.
// usage: node --import tsx tools/bench/own-voice.ts WAV SEGMENTS.json [maxFormantHz=5000] [--labels a,e1,e2,i,o1,o2,u]
import { readFileSync } from "node:fs";
import { FormantEstimator } from "../../src/dsp/formants/index";
import { FormantTracker } from "../../src/dsp/formants/tracker";

const [wavPath, segPath, maxArg] = process.argv.slice(2);
const maxHz = maxArg && !maxArg.startsWith("--") ? Number(maxArg) : 5000;
const labels = process.argv.includes("--labels") ? process.argv[process.argv.indexOf("--labels") + 1].split(",") : [];

function readWav(path: string): { fs: number; x: Float32Array } {
  const b = readFileSync(path);
  let p = 12, fs = 48000, data = 0, len = 0;
  while (p + 8 <= b.length) {
    const id = b.toString("ascii", p, p + 4), sz = b.readUInt32LE(p + 4);
    if (id === "fmt ") fs = b.readUInt32LE(p + 12);
    if (id === "data") { data = p + 8; len = Math.min(sz, b.length - data); break; }
    p += 8 + sz + (sz & 1);
  }
  const n = len >> 1, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(data + 2 * i) / 32768;
  return { fs, x };
}
const { fs, x } = readWav(wavPath);
const segs = JSON.parse(readFileSync(segPath, "utf8")) as { i: number; start: number; end: number; F1: number; F2: number; F3: number }[];
const est = new FormantEstimator(fs, { maxFormantHz: maxHz });
const trk = new FormantTracker({ maxFormantHz: maxHz });
const win = Math.round(0.05 * fs), hop = Math.round(0.01 * fs);
const med = (a: number[]) => (a.length ? [...a].sort((p, q) => p - q)[a.length >> 1] : NaN);
let worst = 0, jumps = 0, jumpFrames = 0;
for (const s of segs) {
  trk.reset();
  const d = s.end - s.start, lo = s.start + 0.2 * d, hi = s.end - 0.2 * d;
  const got: number[][] = [[], [], []];
  let prevF2 = 0;
  let frames = 0, shown = 0;
  for (let t = s.start - 0.05; t <= s.end + 0.05; t += 0.01) {
    const e = Math.round(t * fs) + win / 2;
    if (e - win < 0 || e > x.length) continue;
    const out = trk.update(est.estimate(x.subarray(e - win, e)), t >= s.start && t <= s.end);
    if (t >= lo && t <= hi) { frames++; if (out[1]) { if (prevF2 && Math.abs(out[1].frequencyHz / prevF2 - 1) > 0.25) jumps++; prevF2 = out[1].frequencyHz; jumpFrames++; } if (out.length >= 3) shown++; for (let k = 0; k < 3; k++) if (out[k]) got[k].push(out[k].frequencyHz); }
  }
  const ref = [s.F1, s.F2, s.F3], m = got.map(med);
  const err = m.map((v, k) => (100 * Math.abs(v - ref[k])) / ref[k]);
  worst = Math.max(worst, ...err.slice(0, 2));
  console.log(`${(labels[s.i] ?? String(s.i)).padEnd(3)} ref ${ref.join("/")}  mine ${m.map(Math.round).join("/")}  err% ${err.map((v) => v.toFixed(0)).join("/")}  F1-F3 shown ${shown}/${frames}`);
}
console.log(`worst F1/F2 error vs Praat: ${worst.toFixed(0)}%  | F2 jumps >25% per frame: ${jumps}/${jumpFrames}`);
