/// <reference lib="webworker" />
import type { PraatArtifactUrls, RuntimeRequest, RuntimeResponse, WorkerAnalysis } from "./praat-runtime-protocol";

type EmscriptenModule = {
  HEAPU8: Uint8Array; HEAPF32: Float32Array; HEAPF64: Float64Array;
  _malloc(bytes: number): number; _free(pointer: number): void;
  _praat_spectrogram_v1(...args: number[]): number;
  _praat_pitch_raw_ac_v1(...args: number[]): number;
  _praat_harmonicity_cc_v1(...args: number[]): number;
};
type EmscriptenFactory = () => Promise<EmscriptenModule>;
let spectrogram: EmscriptenModule | undefined;
let pitchHarmonicity: EmscriptenModule | undefined;

self.onmessage = async (event: MessageEvent<{ type: "init"; artifactUrls: PraatArtifactUrls } | RuntimeRequest>) => {
  try {
    if (event.data.type === "init") {
      [spectrogram, pitchHarmonicity] = await Promise.all([load(event.data.artifactUrls.spectrogram), load(event.data.artifactUrls.pitchHarmonicity)]);
      post({ type: "ready" });
      return;
    }
    if (!spectrogram || !pitchHarmonicity) throw new Error("Praat artifacts not ready.");
    post({ type: "result", id: event.data.id, analysis: analyze(event.data, spectrogram, pitchHarmonicity) });
  } catch (error) { post({ type: "failure", message: error instanceof Error ? error.message : "Praat analysis failed." }); }
};

async function load(url: string): Promise<EmscriptenModule> {
  const imported = await import(/* @vite-ignore */ url) as { default?: EmscriptenFactory };
  if (!imported.default) throw new Error(`Invalid Praat artifact: ${url}`);
  return imported.default();
}

function analyze(request: RuntimeRequest, spec: EmscriptenModule, ph: EmscriptenModule): WorkerAnalysis {
  if (!Number.isFinite(request.sampleRate) || request.sampleRate <= 0 || request.samples.length === 0) throw new Error("Invalid analysis window.");
  const f0Hz = runTrack(ph, "_praat_pitch_raw_ac_v1", request.samples, request.sampleRate, [0.01, 75, 600, 15, 0, 0.03, 0.45, 0.01, 0.35, 0.14]);
  const hnrDb = runTrack(ph, "_praat_harmonicity_cc_v1", request.samples, request.sampleRate, [0.01, 75, 0.1, 1]);
  const f0 = lastFinite(f0Hz);
  return { f0Hz: f0, hnrDb: lastFinite(hnrDb), measuredPeaks: measuredPeaks(spec, request.samples, request.sampleRate, f0, request.partialCount) };
}

function runTrack(module: EmscriptenModule, name: "_praat_pitch_raw_ac_v1" | "_praat_harmonicity_cc_v1", samples: Float32Array, sampleRate: number, params: number[]): Float64Array {
  const input = module._malloc(samples.byteLength), inputStruct = module._malloc(24), meta = module._malloc(24);
  if (!input || !inputStruct || !meta) throw new Error("Praat WASM allocation failed.");
  try {
    new Float32Array(module.HEAPU8.buffer, input, samples.length).set(samples);
    const view = new DataView(module.HEAPU8.buffer); view.setUint32(inputStruct, input, true); view.setInt32(inputStruct + 4, 1, true); view.setInt32(inputStruct + 8, samples.length, true); view.setFloat64(inputStruct + 16, 1 / sampleRate, true);
    const fn = module[name].bind(module);
    if (fn(inputStruct, ...params, 0, 0, meta) !== 3) throw new Error(`${name} preflight failed.`);
    const frames = view.getInt32(meta, true); if (frames < 1 || frames > 4096) throw new Error(`${name} invalid frame count.`);
    const output = module._malloc(frames * 8); if (!output) throw new Error("Praat WASM allocation failed.");
    try { if (fn(inputStruct, ...params, output, frames, meta) !== 0) throw new Error(`${name} failed.`); return new Float64Array(module.HEAPF64.buffer, output, frames).slice(); } finally { module._free(output); }
  } finally { module._free(meta); module._free(inputStruct); module._free(input); }
}

function measuredPeaks(module: EmscriptenModule, samples: Float32Array, sampleRate: number, f0Hz: number | null, partialCount: number): WorkerAnalysis["measuredPeaks"] {
  if (f0Hz === null) return Array.from({ length: partialCount }, () => null);
  // ABI call validates/bounds artifact access. Peak extraction waits for M3 spectral frame contract.
  const spectrum = runSpectrogram(module, samples, sampleRate);
  return Array.from({ length: partialCount }, (_, index) => {
    const theoryHz = f0Hz * (index + 1); if (theoryHz >= sampleRate / 2) return null;
    const center = Math.round((theoryHz - spectrum.firstFrequencyHz) / spectrum.frequencyStepHz);
    let bestBin = -1, bestPower = -Infinity;
    for (let bin = Math.max(0, center - 2); bin <= Math.min(spectrum.bins - 1, center + 2); bin += 1) {
      const power = spectrum.values[(spectrum.frames - 1) * spectrum.bins + bin];
      if (power > bestPower) { bestPower = power; bestBin = bin; }
    }
    return bestBin < 0 || !Number.isFinite(bestPower) ? null : { frequencyHz: spectrum.firstFrequencyHz + bestBin * spectrum.frequencyStepHz, levelDb: 10 * Math.log10(Math.max(bestPower, Number.MIN_VALUE)) };
  });
}

function runSpectrogram(module: EmscriptenModule, samples: Float32Array, sampleRate: number): { values: Float64Array; frames: number; bins: number; firstFrequencyHz: number; frequencyStepHz: number } {
  const input = module._malloc(samples.byteLength), inputStruct = module._malloc(24), meta = module._malloc(40);
  if (!input || !inputStruct || !meta) throw new Error("Praat WASM allocation failed.");
  try {
    new Float32Array(module.HEAPU8.buffer, input, samples.length).set(samples); const view = new DataView(module.HEAPU8.buffer);
    view.setUint32(inputStruct, input, true); view.setInt32(inputStruct + 4, 1, true); view.setInt32(inputStruct + 8, samples.length, true); view.setFloat64(inputStruct + 16, 1 / sampleRate, true);
    const invoke = (out: number, capacity: number) => module._praat_spectrogram_v1(inputStruct, 0.005, 5000, 0.002, 20, 4, out, capacity, meta);
    if (invoke(0, 0) !== 3) throw new Error("_praat_spectrogram_v1 preflight failed."); const frames = view.getInt32(meta, true), bins = view.getInt32(meta + 4, true), count = frames * bins;
    if (count < 1 || count > 1_000_000) throw new Error("_praat_spectrogram_v1 invalid output size."); const output = module._malloc(count * 8); if (!output) throw new Error("Praat WASM allocation failed.");
    try { if (invoke(output, count) !== 0) throw new Error("_praat_spectrogram_v1 failed."); return { values: new Float64Array(module.HEAPF64.buffer, output, count).slice(), frames, bins, firstFrequencyHz: view.getFloat64(meta + 24, true), frequencyStepHz: view.getFloat64(meta + 32, true) }; } finally { module._free(output); }
  } finally { module._free(meta); module._free(inputStruct); module._free(input); }
}

function lastFinite(values: Float64Array): number | null { for (let index = values.length - 1; index >= 0; index -= 1) if (Number.isFinite(values[index]) && values[index] > 0) return values[index]; return null; }
function post(message: RuntimeResponse): void { self.postMessage(message); }
