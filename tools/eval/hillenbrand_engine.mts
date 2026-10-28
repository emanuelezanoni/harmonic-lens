// Run the real streaming AnalysisEngine on Hillenbrand (1995) vowel tokens and dump the
// frame nearest each token's steady-state time. usage: node --import tsx hillenbrand_engine.mts DATA_DIR OUT.json [stride]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AnalysisEngine, type FrameResult } from "../../src/dsp/engine";
import { FormantEstimator } from "../../src/dsp/formants";
import { pitchRangeFor } from "../../src/dsp/analysis-protocol";
import { loadPraatPitchModule, PraatPitchHarmonicity } from "../../src/dsp/praat-wasm";

const [dataDir, outPath, strideArg] = process.argv.slice(2);
const stride = Number(strideArg ?? 1);
const maxFormant: Record<string, number> = { m: 5000, w: 5500, b: 7000, g: 7000 }; // app presets: low / medium / high-child
const times = new Map<string, number>();
for (const line of readFileSync(join(dataDir, "timedata.dat"), "utf8").split("\n")) {
  const p = line.trim().split(/\s+/);
  if (/^[mwbg]\d\d\w\w$/.test(p[0]) && p.length >= 5) times.set(p[0], (Number(p[3]) + Number(p[4])) / 2000);
}
function readWav(path: string): { samples: Float32Array; rate: number } {
  const b = readFileSync(path);
  const rate = b.readUInt32LE(24);
  let o = 12; while (b.toString("ascii", o, o + 4) !== "data") o += 8 + b.readUInt32LE(o + 4);
  const n = b.readUInt32LE(o + 4) / 2;
  return { rate, samples: Float32Array.from({ length: n }, (_, i) => b.readInt16LE(o + 8 + 2 * i) / 32768) };
}

const module = await loadPraatPitchModule(new URL("../../public/praat-wasm/praat-pitch-harmonicity.js", import.meta.url).href);
const rows: unknown[] = [];
let count = 0;
for (const group of ["men", "women", "kids"]) {
  const files = readdirSync(join(dataDir, group)).filter((f) => f.endsWith(".wav")).sort();
  for (const [index, file] of files.entries()) {
    if (index % stride) continue;
    const id = file.replace(".wav", ""), t = times.get(id);
    if (t === undefined) continue;
    const { samples, rate } = readWav(join(dataDir, group, file));
    const praat = new PraatPitchHarmonicity(module, { timeStepS: 0.01, ...pitchRangeFor(maxFormant[id[0]]) }); // same pitch range the app derives from the voice preset
    const engine = new AnalysisEngine({ sampleRate: rate }, praat, new FormantEstimator(rate, { maxFormantHz: maxFormant[id[0]] }));
    let best: FrameResult | null = null;
    for (let i = 0; i + 128 <= samples.length; i += 128) {
      const frame = engine.push(samples.subarray(i, i + 128));
      if (frame && (best === null || Math.abs(frame.timeS - 0.025 - t) < Math.abs(best.timeS - 0.025 - t))) best = frame;
    }
    if (best) rows.push({ id, t, maxFormant: maxFormant[id[0]], f0: best.f0Hz, hnr: best.hnrDb, formants: best.formants.map((f) => f.frequencyHz) });
    praat.dispose();
    if (++count % 100 === 0) console.error(count, "tokens");
  }
}
writeFileSync(outPath, JSON.stringify(rows));
console.error("done", rows.length);
