/*
 * Streaming-friendly windowed-sinc resampler used by the formant estimator.
 * Mirrors the role of Praat's Sound_resample (band-limited sinc interpolation)
 * but works on a single frame with a precomputed polyphase table.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

const PHASES = 512;
const LOBES = 20; // output-rate zero crossings on each side of the kernel

export class Resampler {
  readonly ratio: number; // input rate / output rate
  readonly outputCount: number;
  private readonly identity: boolean;
  private readonly halfTaps: number;
  private readonly taps: number;
  private readonly table: Float32Array;
  private readonly basePos: Int32Array;
  private readonly phaseIdx: Uint16Array;

  constructor(inputRate: number, outputRate: number, inputCount: number) {
    this.identity = outputRate >= inputRate;
    this.ratio = this.identity ? 1 : inputRate / outputRate;
    this.outputCount = this.identity ? inputCount : Math.floor(inputCount / this.ratio);
    this.halfTaps = Math.ceil(LOBES * this.ratio);
    this.taps = 2 * this.halfTaps;
    this.table = new Float32Array(this.identity ? 0 : PHASES * this.taps);
    this.basePos = new Int32Array(this.outputCount);
    this.phaseIdx = new Uint16Array(this.outputCount);
    if (this.identity) return;
    const r = this.ratio;
    const W = this.halfTaps;
    for (let p = 0; p < PHASES; p++) {
      const frac = p / PHASES;
      let sum = 0;
      const off = p * this.taps;
      for (let k = 0; k < this.taps; k++) {
        const d = k - (W - 1) - frac; // distance (input samples) tap -> output position
        const u = d / r;
        const sinc = Math.abs(u) < 1e-12 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u);
        const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / W); // Hann
        const v = Math.abs(d) >= W ? 0 : sinc * w;
        this.table[off + k] = v;
        sum += v;
      }
      for (let k = 0; k < this.taps; k++) this.table[off + k] /= sum;
    }
    for (let j = 0; j < this.outputCount; j++) {
      const pos = (j + 0.5) * r - 0.5; // centre of output sample j in input index space
      const i0 = Math.floor(pos);
      let ph = Math.round((pos - i0) * PHASES);
      let base = i0;
      if (ph === PHASES) { ph = 0; base += 1; }
      this.basePos[j] = base;
      this.phaseIdx[j] = ph;
    }
  }

  /** Resample `input` (length = inputCount given in ctor) into `out`. */
  process(input: Float32Array, inOffset: number, inLen: number, out: Float64Array): void {
    if (this.identity) {
      for (let j = 0; j < this.outputCount; j++) out[j] = input[inOffset + j];
      return;
    }
    const W = this.halfTaps;
    const T = this.taps;
    const tbl = this.table;
    for (let j = 0; j < this.outputCount; j++) {
      const start = this.basePos[j] - (W - 1);
      const off = this.phaseIdx[j] * T;
      let k0 = 0;
      let k1 = T;
      if (start < 0) k0 = -start;
      if (start + T > inLen) k1 = inLen - start;
      let acc = 0;
      const b = inOffset + start;
      for (let k = k0; k < k1; k++) acc += tbl[off + k] * input[b + k];
      out[j] = acc;
    }
  }
}
