/**
 * Typed wrapper around the pinned Praat WASM pitch/harmonicity artifact
 * (public/praat-wasm/praat-pitch-harmonicity.*, Praat v7.0.02, GPL-2.0-or-later).
 * No DOM or Worker dependency: usable from the analysis worker and from Node tests.
 */
export type EmscriptenPitchModule = {
  HEAPU8: Uint8Array; HEAPF64: Float64Array;
  _malloc(bytes: number): number; _free(pointer: number): void;
  _praat_pitch_raw_ac_v1(...args: number[]): number;
  _praat_harmonicity_cc_v1(...args: number[]): number;
};
export type EmscriptenFactory = () => Promise<EmscriptenPitchModule>;

export type PitchParams = { timeStepS: number; floorHz: number; ceilingHz: number };

/** Parameters mirror Praat's "Sound: To Pitch (raw ac)" defaults for voice. */
const pitchArgs = (p: PitchParams) => [p.timeStepS, p.floorHz, p.ceilingHz, 15, 0, 0.03, 0.45, 0.01, 0.35, 0.14];
const harmonicityArgs = (p: PitchParams) => [p.timeStepS, p.floorHz, 0.1, 1];

export async function loadPraatPitchModule(url: string): Promise<EmscriptenPitchModule> {
  const imported = await import(/* @vite-ignore */ url) as { default?: EmscriptenFactory };
  if (!imported.default) throw new Error(`Invalid Praat artifact: ${url}`);
  return imported.default();
}

export class PraatPitchHarmonicity {
  private input = 0;
  private inputCapacity = 0;
  private readonly inputStruct: number;
  private readonly meta: number;
  private output = 0;
  private outputCapacity = 0;

  constructor(private readonly module: EmscriptenPitchModule, readonly params: PitchParams = { timeStepS: 0.01, floorHz: 75, ceilingHz: 600 }) {
    this.inputStruct = module._malloc(24);
    this.meta = module._malloc(24);
    if (!this.inputStruct || !this.meta) throw new Error("Praat WASM allocation failed.");
  }

  /** Latest voiced F0 (Hz) in `samples`, or null. Needs >= 3/floor seconds of audio. */
  pitch(samples: Float32Array, sampleRate: number): number | null {
    return lastFiniteAbove(this.run("_praat_pitch_raw_ac_v1", samples, sampleRate, pitchArgs(this.params)), 0);
  }

  /** Latest harmonics-to-noise ratio (dB), or null. */
  harmonicity(samples: Float32Array, sampleRate: number): number | null {
    // Praat reports -200 dB for unvoiced frames; real (even negative) HNR values sit far above that.
    return lastFiniteAbove(this.run("_praat_harmonicity_cc_v1", samples, sampleRate, harmonicityArgs(this.params)), -100);
  }

  dispose(): void {
    for (const pointer of [this.input, this.inputStruct, this.meta, this.output]) if (pointer) this.module._free(pointer);
    this.input = this.output = 0;
  }

  private run(name: "_praat_pitch_raw_ac_v1" | "_praat_harmonicity_cc_v1", samples: Float32Array, sampleRate: number, args: number[]): Float64Array {
    const m = this.module;
    if (!Number.isFinite(sampleRate) || sampleRate <= 0 || samples.length === 0) throw new Error("Invalid analysis window.");
    if (samples.length > this.inputCapacity) {
      if (this.input) m._free(this.input);
      this.input = m._malloc(samples.length * 4);
      this.inputCapacity = samples.length;
      if (!this.input) throw new Error("Praat WASM allocation failed.");
    }
    new Float32Array(m.HEAPU8.buffer, this.input, samples.length).set(samples);
    const view = new DataView(m.HEAPU8.buffer);
    view.setUint32(this.inputStruct, this.input, true);
    view.setInt32(this.inputStruct + 4, 1, true);
    view.setInt32(this.inputStruct + 8, samples.length, true);
    view.setFloat64(this.inputStruct + 16, 1 / sampleRate, true);
    const fn = m[name].bind(m);
    if (fn(this.inputStruct, ...args, 0, 0, this.meta) !== 3) throw new Error(`${name} preflight failed.`);
    const frames = new DataView(m.HEAPU8.buffer).getInt32(this.meta, true);
    if (frames < 1 || frames > 4096) throw new Error(`${name} invalid frame count.`);
    if (frames > this.outputCapacity) {
      if (this.output) m._free(this.output);
      this.output = m._malloc(frames * 8);
      this.outputCapacity = frames;
      if (!this.output) throw new Error("Praat WASM allocation failed.");
    }
    if (fn(this.inputStruct, ...args, this.output, frames, this.meta) !== 0) throw new Error(`${name} failed.`);
    return new Float64Array(m.HEAPF64.buffer, this.output, frames).slice();
  }
}

function lastFiniteAbove(values: Float64Array, minimum: number): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(values[i]) && values[i] > minimum) return values[i];
  }
  return null;
}
