// Benchmark the formant estimator against Hillenbrand et al. (1995) hand-checked steady-state F1-F3.
// usage: node --import tsx tools/bench/hillenbrand-bench.ts DATA_DIR [--max men=5000,women=5500,kids=6500]
import { readFileSync } from "node:fs";
import { FormantEstimator } from "../../src/dsp/formants/index";

const dir = process.argv[2];
const maxArg = process.argv.indexOf("--max");
const maxHz: Record<string, number> = { men: 5000, women: 5500, kids: 6500 };
if (maxArg > 0) for (const kv of process.argv[maxArg + 1].split(",")) { const [k, v] = kv.split("="); maxHz[k] = Number(v); }
const folder: Record<string, string> = { m: "men", w: "women", b: "kids", g: "kids" };

const truth = new Map<string, number[]>();
for (const l of readFileSync(`${dir}/raw/vowdata.dat`, "utf8").split("\n")) {
  const p = l.trim().split(/\s+/);
  if (/^[mwbg]\d\d\w\w$/.test(p[0] ?? "") && p.length >= 7) truth.set(p[0], p.slice(2, 6).map(Number));
}
const centre = new Map<string, number>();
for (const l of readFileSync(`${dir}/raw/timedata.dat`, "utf8").split("\n")) {
  const p = l.trim().split(/\s+/);
  if (/^[mwbg]\d\d\w\w$/.test(p[0] ?? "") && p.length >= 5) centre.set(p[0], (Number(p[3]) + Number(p[4])) / 2e3);
}
const read = (path: string) => {
  const b = readFileSync(path);
  const i16 = new Int16Array(b.buffer.slice(b.byteOffset + 44, b.byteOffset + b.length - ((b.length - 44) % 2)));
  return Float32Array.from(i16, (v) => v / 32768);
};
const ests: Record<string, FormantEstimator> = {};
const errs: Record<string, number[][]> = {};
const hit: Record<string, number[]> = {};
for (const [id, tr] of truth) {
  const g = folder[id[0]], c = centre.get(id);
  if (c === undefined || tr[1] === 0 || tr[2] === 0) continue;
  const x = read(`${dir}/wav/${g}/${id}.wav`);
  ests[g] ??= new FormantEstimator(16000, { maxFormantHz: maxHz[g] });
  const n = Math.round(0.05 * 16000), mid = Math.round(c * 16000);
  const seg = x.subarray(Math.max(0, mid - n / 2), Math.max(0, mid - n / 2) + n);
  if (seg.length < n) continue;
  const f = ests[g].estimate(seg);
  errs[g] ??= [[], [], []]; hit[g] ??= [0, 0];
  hit[g][1]++;
  for (let k = 0; k < 3; k++) {
    const got = f[k]?.frequencyHz;
    if (got !== undefined && tr[k + 1] > 0) errs[g][k].push(Math.abs(got - tr[k + 1]) / tr[k + 1]);
    else if (tr[k + 1] > 0) errs[g][k].push(1);
  }
}
const med = (a: number[]) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];
for (const g of Object.keys(errs)) {
  const row = errs[g].map((e) => `${(100 * med(e)).toFixed(1)}% (>20%: ${((100 * e.filter((v) => v > 0.2).length) / e.length).toFixed(0)}%)`);
  console.log(`${g.padEnd(6)} n=${hit[g][1]}  F1 ${row[0]}  F2 ${row[1]}  F3 ${row[2]}`);
}
