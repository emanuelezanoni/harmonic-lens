/*
 * Causal formant tracker. The raw estimator returns every pole in range, sorted by frequency; which of
 * them is F1/F2/F3 is undecided (extra poles from nasals, glottal source or noise; merged or missing
 * ones). Each frame the candidates are assigned to the slots F1..F4 by dynamic programming over
 * (slot, candidate) minimising: log-frequency distance from the slot's previous value, a weak prior on
 * typical slot centres (dominant on a cold start), a bandwidth penalty, and a skip cost for empty slots.
 * Slots keep increasing order. A skipped slot is held for a few frames, then dropped.
 */
import { FormantEstimator, type Formant, type FormantOptions } from "./index";

export type FormantTrackerOptions = {
  maxFormantHz?: number;
  slots?: number;
  /** Expected frame-to-frame movement in ln(Hz); transitions of ~1 octave over 60 ms give ~0.12. */
  sigmaStep?: number;
  /** Largest bandwidth accepted as a formant candidate. */
  maxBandwidthHz?: number;
  holdFrames?: number;
  /** Weight of the new observation, 1 = no smoothing. */
  gain?: number;
};

const CENTERS_HZ = [500, 1500, 2500, 3500, 4500];
const SKIP_COST = [4.5, 4.5, 3.2, 3.2, 1.5];
const FLOOR_HZ = 150;
const MEDIAN_N = 3;
const SKIP_PENALTY = 8;
const STEP_CAP = 1;
const ENOUGH_FACTOR = 1;

export class FormantTracker {
  private readonly slots: number;
  private readonly sigmaStep: number;
  private readonly maxBw: number;
  private readonly holdFrames: number;
  private readonly gain: number;
  private readonly maxHz: number;
  private readonly centersLn: number[];
  private readonly lnPrev: Float64Array;
  private readonly bwPrev: Float64Array;
  private readonly recent: Float64Array; // last MEDIAN_N assigned ln(Hz) per slot, newest first (0 = empty)
  private readonly age: Int32Array; // frames since slot last observed; large = no history
  private readonly NONE = 1 << 20;

  private cf = new Float64Array(0);
  private cb = new Float64Array(0);
  private memo = new Float64Array(0);
  private memoChoice = new Int32Array(0);

  constructor(options: FormantTrackerOptions = {}) {
    this.slots = Math.min(options.slots ?? 4, CENTERS_HZ.length);
    this.sigmaStep = options.sigmaStep ?? 0.12;
    this.maxBw = options.maxBandwidthHz ?? 4000;
    this.holdFrames = options.holdFrames ?? 3;
    this.gain = options.gain ?? 0.7;
    this.maxHz = options.maxFormantHz ?? 5500;
    const scale = Math.sqrt(this.maxHz / 5500);
    this.centersLn = CENTERS_HZ.map((c) => Math.log(c * scale));
    this.lnPrev = new Float64Array(this.slots);
    this.bwPrev = new Float64Array(this.slots);
    this.recent = new Float64Array(this.slots * MEDIAN_N);
    this.age = new Int32Array(this.slots).fill(this.NONE);
  }

  reset(): void {
    this.recent.fill(0);
    this.age.fill(this.NONE);
  }

  /**
   * `voiced` = the frame has a periodic source. Aspiration, fricatives and onsets produce poles that say
   * nothing about the vowel and would poison the history, so unvoiced frames are assigned cold and forgotten.
   */
  update(candidates: readonly Formant[], voiced = true): Formant[] {
    if (!voiced) this.reset();
    const out = this.assign(candidates);
    if (!voiced) this.reset();
    return out;
  }

  private assign(candidates: readonly Formant[]): Formant[] {
    const S = this.slots;
    let n = 0;
    if (this.cf.length < candidates.length) {
      this.cf = new Float64Array(candidates.length);
      this.cb = new Float64Array(candidates.length);
    }
    for (const c of candidates) {
      if (c.bandwidthHz > this.maxBw || c.frequencyHz < FLOOR_HZ) continue;
      this.cf[n] = Math.log(c.frequencyHz);
      this.cb[n] = c.bandwidthHz;
      n++;
    }
    const width = n + 1;
    const need = (S + 1) * width;
    if (this.memo.length < need) { this.memo = new Float64Array(need); this.memoChoice = new Int32Array(need); }
    // memo[k * width + i]: best cost for slots k..S-1 using candidates i..n-1; choice = candidate or -1 (skip)
    for (let i = 0; i <= n; i++) this.memo[S * width + i] = 0;
    for (let k = S - 1; k >= 0; k--) {
      for (let i = n; i >= 0; i--) {
        // Leaving a slot empty is cheap only when there are not enough candidates left to fill the rest.
        let best = (n - i >= S - k ? ENOUGH_FACTOR * SKIP_COST[k] : SKIP_COST[k]) + this.memo[(k + 1) * width + i];
        let choice = -1;
        let skipped = 0; // candidates passed over between i and j: narrow poles are expensive to ignore
        for (let j = i; j < n; j++) {
          const total = skipped + this.cost(k, j) + this.memo[(k + 1) * width + j + 1];
          if (total < best) { best = total; choice = j; }
          skipped += SKIP_PENALTY * Math.exp(-this.cb[j] / 700);
        }
        this.memo[k * width + i] = best;
        this.memoChoice[k * width + i] = choice;
      }
    }
    const out: Formant[] = [];
    let i = 0;
    let lostFrom = S;
    for (let k = 0; k < S; k++) {
      const choice = this.memoChoice[k * width + i];
      if (choice >= 0) {
        const obs = this.cf[choice];
        const hasHistory = this.age[k] <= this.holdFrames;
        this.lnPrev[k] = hasHistory ? this.lnPrev[k] + this.gain * (obs - this.lnPrev[k]) : obs;
        this.bwPrev[k] = this.cb[choice];
        this.age[k] = 0;
        this.push(k, this.lnPrev[k]);
        i = choice + 1;
      } else if (this.age[k] < this.NONE) {
        this.age[k] += 1;
      }
      if (this.age[k] <= this.holdFrames) out.push({ frequencyHz: Math.exp(this.median(k)), bandwidthHz: this.bwPrev[k] });
      else if (lostFrom === S) lostFrom = k;
    }
    // Slots past the first lost one are unreliable (no stable ordering left to anchor them).
    if (lostFrom < S) out.length = Math.min(out.length, lostFrom);
    return out;
  }

  private push(k: number, ln: number): void {
    const base = k * MEDIAN_N;
    for (let q = MEDIAN_N - 1; q > 0; q--) this.recent[base + q] = this.recent[base + q - 1];
    this.recent[base] = ln;
  }

  private median(k: number): number {
    const base = k * MEDIAN_N;
    const v: number[] = [];
    for (let q = 0; q < MEDIAN_N; q++) if (this.recent[base + q] !== 0) v.push(this.recent[base + q]);
    if (v.length === 0) return this.lnPrev[k];
    v.sort((a, b) => a - b);
    return v[v.length >> 1];
  }

  private cost(k: number, j: number): number {
    const lnf = this.cf[j];
    const bw = Math.min(this.cb[j], 1500) / 300;
    let c = 0.05 * bw * bw;
    const hasHistory = this.age[k] <= this.holdFrames;
    const dp = (lnf - this.centersLn[k]) / 0.8;
    c += (hasHistory ? 0.15 : 1) * dp * dp;
    if (hasHistory) {
      const dt = (lnf - this.lnPrev[k]) / this.sigmaStep;
      c += Math.min(dt * dt, STEP_CAP) * 0.5;
    }
    return c;
  }
}

/** Raw Burg estimator + tracker: the provider the app runs. */
export class TrackedFormants {
  private readonly estimator: FormantEstimator;
  private readonly tracker: FormantTracker;

  constructor(sampleRate: number, options: FormantOptions = {}, tracker: FormantTrackerOptions = {}) {
    this.estimator = new FormantEstimator(sampleRate, options);
    this.tracker = new FormantTracker({ maxFormantHz: options.maxFormantHz, ...tracker });
  }

  reset(): void { this.tracker.reset(); }

  estimate(samples: Float32Array, voiced = true): Formant[] {
    return this.tracker.update(this.estimator.estimate(samples), voiced);
  }
}
