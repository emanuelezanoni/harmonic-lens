/*
 * Real-time single-frame formant estimator following Praat's
 * Sound_to_Formant_burg (Praat fon/Sound_to_Formant.cpp, fon/Sound_to_LPC.cpp
 * and melder/LPC Burg): resample to 2*maxFormant, pre-emphasis, Gaussian
 * window, Burg LPC of order 2*formantCount, polynomial roots, poles
 * outside the unit circle reflected inside, keep upper-half-plane roots
 * within [50 Hz, Nyquist-50 Hz]. Implemented from the algorithm description.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { Burg } from "./burg";
import { Resampler } from "./resample";
import { RootFinder } from "./roots";

export type Formant = { frequencyHz: number; bandwidthHz: number };
export type FormantOptions = {
  maxFormantHz?: number;
  formantCount?: number;
  windowLengthS?: number;
  preEmphasisFromHz?: number;
};

const SAFETY_MARGIN_HZ = 50;

export class FormantEstimator {
  private readonly fsOut: number;
  private readonly nIn: number;
  private readonly nOut: number;
  private readonly order: number;
  private readonly resampler: Resampler;
  private readonly burg: Burg;
  private readonly roots: RootFinder;
  private readonly rs: Float64Array;
  private readonly win: Float64Array;
  private readonly lpc: Float64Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly preA: number;

  constructor(sampleRate: number, options: FormantOptions = {}) {
    const maxHz = options.maxFormantHz ?? 5500;
    const count = options.formantCount ?? 5;
    const winS = options.windowLengthS ?? 0.025;
    const preHz = options.preEmphasisFromHz ?? 50;
    this.order = 2 * count;
    this.nIn = Math.round(2 * winS * sampleRate);
    this.resampler = new Resampler(sampleRate, 2 * maxHz, this.nIn);
    this.fsOut = sampleRate / this.resampler.ratio;
    this.nOut = this.resampler.outputCount;
    this.preA = Math.exp((-2 * Math.PI * preHz) / this.fsOut);
    this.rs = new Float64Array(this.nOut);
    this.win = new Float64Array(this.nOut);
    const edge = Math.exp(-12);
    const n = this.nOut;
    const mid = 0.5 * (n + 1);
    for (let i = 1; i <= n; i++) {
      const d = i - mid;
      this.win[i - 1] = (Math.exp((-48 * d * d) / ((n + 1) * (n + 1))) - edge) / (1 - edge);
    }
    this.burg = new Burg(n, this.order);
    this.roots = new RootFinder(this.order);
    this.lpc = new Float64Array(this.order + 1);
    this.re = new Float64Array(this.order);
    this.im = new Float64Array(this.order);
  }

  estimate(samples: Float32Array): Formant[] {
    if (samples.length < this.nIn) return [];
    const { rs, win, nOut: n } = this;
    this.resampler.process(samples, samples.length - this.nIn, this.nIn, rs);
    for (let i = n - 1; i >= 1; i--) rs[i] -= this.preA * rs[i - 1];
    for (let i = 0; i < n; i++) rs[i] *= win[i];
    if (!this.burg.run(rs, n, this.lpc)) return [];
    this.roots.solveFromPredictor(this.lpc, this.re, this.im);
    const out: Formant[] = [];
    const fs = this.fsOut;
    const maxF = fs / 2 - SAFETY_MARGIN_HZ;
    for (let k = 0; k < this.order; k++) {
      let r = this.re[k];
      let i = this.im[k];
      if (i < 0) continue;
      let mag2 = r * r + i * i;
      if (mag2 > 1) { // reflect into the unit circle
        r /= mag2; i /= mag2; mag2 = 1 / mag2;
      }
      const f = (Math.atan2(i, r) * fs) / (2 * Math.PI);
      if (f < SAFETY_MARGIN_HZ || f > maxF) continue;
      const bw = (-Math.log(mag2) * fs) / (2 * Math.PI);
      out.push({ frequencyHz: f, bandwidthHz: bw });
    }
    out.sort((a, b) => a.frequencyHz - b.frequencyHz);
    return out;
  }
}
