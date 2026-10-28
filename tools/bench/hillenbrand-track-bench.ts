// Temporal benchmark: run the streaming estimator (+ optional tracker) from the token start at a 10 ms hop and
// score F1-F3 against Hillenbrand's hand-checked values at 20/50/80 % of the vowel nucleus.
// usage: node --import tsx tools/bench/hillenbrand-track-bench.ts DATA_DIR [--raw] [--only men|women|kids]
import { readFileSync } from "node:fs";
import { FormantEstimator } from "../../src/dsp/formants/index";
import { FormantTracker } from "../../src/dsp/formants/tracker";

const dir = process.argv[2];
const raw = process.argv.includes("--raw");
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const arg = (name: string) => (process.argv.includes(name) ? Number(process.argv[process.argv.indexOf(name) + 1]) : null);
const maxHz: Record<string, number> = { men: 5000, women: 5500, kids: 6500 };
const forceMax = arg("--max"); // evaluate with a deliberately wrong voice-type setting
if (forceMax) for (const g of Object.keys(maxHz)) maxHz[g] = forceMax;
const snrDb = arg("--snr"); // white noise at this SNR (dB, relative to the token RMS)
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const folder: Record<string, string> = { m: "men", w: "women", b: "kids", g: "kids" };
const FS = 16000, HOP = 0.01, WIN = 0.05;

const rows = new Map<string, number[]>();
for (const l of readFileSync(`${dir}/raw/vowdata.dat`, "utf8").split("\n")) {
  const p = l.trim().split(/\s+/);
  if (/^[mwbg]\d\d\w\w$/.test(p[0] ?? "") && p.length >= 16) rows.set(p[0], p.slice(1).map(Number));
}
const times = new Map<string, [number, number]>();
for (const l of readFileSync(`${dir}/raw/timedata.dat`, "utf8").split("\n")) {
  const p = l.trim().split(/\s+/);
  if (/^[mwbg]\d\d\w\w$/.test(p[0] ?? "") && p.length >= 5) times.set(p[0], [Number(p[1]) / 1e3, Number(p[2]) / 1e3]);
}
const read = (path: string) => {
  const b = readFileSync(path);
  const i16 = new Int16Array(b.buffer.slice(b.byteOffset + 44, b.byteOffset + b.length - ((b.length - 44) % 2)));
  return Float32Array.from(i16, (v) => v / 32768);
};

// Voicing proxy: normalised autocorrelation peak in the 75-500 Hz lag range of the analysis window.
function voiced(w: Float32Array): boolean {
  let e0 = 0;
  for (let i = 0; i < w.length; i++) e0 += w[i] * w[i];
  if (e0 < 1e-7 * w.length) return false;
  let best = 0;
  for (let lag = Math.floor(FS / 500); lag <= Math.floor(FS / 75); lag++) {
    let a = 0, b = 0;
    for (let i = 0; i + lag < w.length; i++) { a += w[i] * w[i + lag]; b += w[i + lag] * w[i + lag]; }
    best = Math.max(best, a / Math.sqrt(e0 * Math.max(b, 1e-12)));
  }
  return best > 0.5;
}

const errs: Record<string, number[][]> = {};
for (const [id, r] of rows) {
  const g = folder[id[0]], tt = times.get(id);
  if (!tt || (only && g !== only)) continue;
  const x = read(`${dir}/wav/${g}/${id}.wav`);
  if (snrDb !== null) {
    let e = 0;
    for (const v of x) e += v * v;
    const sigma = Math.sqrt(e / x.length) / Math.pow(10, snrDb / 20);
    for (let i = 0; i < x.length; i++) x[i] += sigma * gauss();
  }
  const est = new FormantEstimator(FS, { maxFormantHz: maxHz[g] });
  const trk = new FormantTracker({ maxFormantHz: maxHz[g] });
  const [start, end] = tt;
  // truth columns (after dropping the name): 6..8 @20%, 9..11 @50%, 12..14 @80%
  const pts = [0.2, 0.5, 0.8].map((p, pi) => ({ t: start + p * (end - start), f: r.slice(6 + pi * 3, 9 + pi * 3), done: false }));
  const winN = Math.round(WIN * FS);
  const last = pts[2].t + WIN / 2;
  const series: { t: number; f: number[] }[] = [];
  for (let t = WIN; t <= Math.min(last + HOP, x.length / FS); t += HOP) {
    const end0 = Math.round(t * FS);
    const win = x.subarray(end0 - winN, end0);
    const cands = est.estimate(win);
    const got = raw ? cands : trk.update(cands, process.env.NOGATE ? true : voiced(win));
    series.push({ t: t - WIN / 2, f: got.map((f) => f.frequencyHz) });
  }
  errs[g] ??= [[], [], []];
  const truthAt = (t: number, k: number): number => {
    if (t <= pts[0].t) return pts[0].f[k];
    for (let q = 0; q < 2; q++) {
      if (t <= pts[q + 1].t) {
        const a = pts[q].f[k], b = pts[q + 1].f[k];
        return a > 0 && b > 0 ? a + ((b - a) * (t - pts[q].t)) / (pts[q + 1].t - pts[q].t) : 0;
      }
    }
    return pts[2].f[k];
  };
  for (const fr of series) {
    if (fr.t < pts[0].t || fr.t > pts[2].t) continue;
    const pt = { t: fr.t, f: [0, 1, 2].map((k) => truthAt(fr.t, k)) };
    {
    for (let k = 0; k < 3; k++) {
      if (pt.f[k] <= 0) continue;
      const e = fr.f[k] === undefined ? 1 : Math.abs(fr.f[k] - pt.f[k]) / pt.f[k];
      errs[g][k].push(e);
      if (process.env.LIST && e > 0.2) console.log(`BAD ${id} F${k + 1} t=${pt.t.toFixed(3)} truth ${pt.f[k]} got ${fr.f.map(Math.round).join(" ")}`);
    }
    }
  }
}
const med = (a: number[]) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];
const bad = (a: number[]) => (100 * a.filter((v) => v > 0.2).length) / a.length;
console.log(raw ? "RAW (first poles by frequency)" : "TRACKED");
let tot = 0, totN = 0;
for (const g of Object.keys(errs)) {
  const e = errs[g];
  console.log(`${g.padEnd(6)} n=${e[0].length}  ` + e.map((v, k) => `F${k + 1} med ${(100 * med(v)).toFixed(1)}% bad ${bad(v).toFixed(1)}%`).join("  |  "));
  for (const v of e) { tot += v.filter((q) => q > 0.2).length; totN += v.length; }
}
console.log(`overall bad (>20%): ${((100 * tot) / totN).toFixed(2)}%`);
