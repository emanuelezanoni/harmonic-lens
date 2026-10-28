import { Resampler } from "./formants/resample";
import { PeakFinder, SpectrumAnalyzer } from "./spectrum";

export type Formant = { frequencyHz: number; bandwidthHz: number };
export type HarmonicPeak = { frequencyHz: number; levelDb: number };

export interface PitchProvider {
  pitch(samples: Float32Array, sampleRate: number): number | null;
  harmonicity(samples: Float32Array, sampleRate: number): number | null;
}
export interface FormantProvider {
  /** Uses the most recent samples (at least 2 x its window length). `voiced`: a periodic source is present. */
  estimate(samples: Float32Array, voiced?: boolean): Formant[];
  reset?(): void;
}

export type EngineConfig = {
  sampleRate: number;
  /** Analysis hop; one result frame per hop (default 10 ms). */
  hopS?: number;
  partialCount?: number;
  /** Physical Gaussian window of the displayed spectrum: 0.005 wideband (formants), ~0.03 narrowband (harmonics). */
  spectrumWindowS?: number;
  spectrumMaxHz?: number;
  spectrumRows?: number;
  /** Audio handed to the pitch tracker (needs >= 3 / floor seconds). */
  pitchWindowS?: number;
  /** Audio handed to the formant estimator (>= 2 x its Gaussian window). */
  formantWindowS?: number;
  /** Formants/harmonics are skipped below this level (dBFS RMS of the last hop). */
  silenceDb?: number;
  /**
   * Praat's cross-correlation HNR costs 35-100 ms per call at 48 kHz, far over a 10 ms hop. It is run on
   * a decimated copy (default 8 kHz, ~0.5 dB from full band on voiced signals) every few hops, last value held.
   */
  hnrRateHz?: number;
  hnrEveryHops?: number;
  /** Report formants only while a pitch track exists (default true): unvoiced noise has poles but no vowel. */
  formantsNeedVoicing?: boolean;
  /** Consecutive voiced frames before formants are reported (default 3 = 30 ms): onset frames are unreliable. */
  formantOnsetFrames?: number;
};

export type FrameResult = {
  /** Time of the newest sample in this frame, seconds since the engine started. */
  timeS: number;
  levelDb: number;
  f0Hz: number | null;
  hnrDb: number | null;
  formants: Formant[];
  theoreticalHz: (number | null)[];
  peaks: (HarmonicPeak | null)[];
  /** dB re full scale per row, linear 0..spectrumMaxHz. */
  spectrum: Float32Array;
};

/**
 * Streaming analysis: one pipeline, one owner of all state. Audio goes in via `push`;
 * result frames come out, at most one per push (late audio is never replayed).
 */
export class AnalysisEngine {
  readonly hopSamples: number;
  readonly spectrumRows: number;
  readonly spectrumMaxHz: number;
  private readonly partialCount: number;
  private readonly silenceDb: number;
  private readonly ring: Float32Array;
  private readonly pitchWindow: number;
  private readonly formantWindow: number;
  private voicedRun = 0;
  private readonly spectrum: SpectrumAnalyzer;
  private readonly peaks: PeakFinder;
  private readonly pitchScratch: Float32Array;
  private readonly formantScratch: Float32Array;
  private readonly narrowScratch: Float32Array;
  private readonly spectrumScratch: Float32Array;
  private readonly tracker = new PitchTracker();
  private readonly hnrResampler: Resampler;
  private readonly hnrWide: Float64Array;
  private readonly hnrSamples: Float32Array;
  private readonly hnrEvery: number;
  private readonly hnrRate: number;
  private hnrHold: number | null = null;
  private hopCount = 0;
  private total = 0;
  private lastEmit = 0;

  constructor(private readonly config: EngineConfig, private readonly pitch: PitchProvider, private readonly formants: FormantProvider) {
    const sr = config.sampleRate;
    this.hopSamples = Math.max(1, Math.round((config.hopS ?? 0.01) * sr));
    this.partialCount = config.partialCount ?? 8;
    this.silenceDb = config.silenceDb ?? -60;
    this.spectrumRows = config.spectrumRows ?? 256;
    this.spectrumMaxHz = Math.min(config.spectrumMaxHz ?? 5000, sr / 2);
    this.pitchWindow = Math.round((config.pitchWindowS ?? 0.06) * sr);
    this.formantWindow = Math.round((config.formantWindowS ?? 0.05) * sr);
    this.spectrum = new SpectrumAnalyzer(sr, { windowS: config.spectrumWindowS ?? 0.005, maxHz: this.spectrumMaxHz, rows: this.spectrumRows, preEmphasisFromHz: 50 });
    this.peaks = new PeakFinder(sr);
    this.ring = new Float32Array(Math.max(this.pitchWindow, this.formantWindow, this.spectrum.windowSamples, this.peaks.windowSamples) * 2);
    this.pitchScratch = new Float32Array(this.pitchWindow);
    this.formantScratch = new Float32Array(this.formantWindow);
    this.narrowScratch = new Float32Array(this.peaks.windowSamples);
    this.spectrumScratch = new Float32Array(this.spectrum.windowSamples);
    this.hnrRate = Math.min(config.hnrRateHz ?? 8000, sr);
    this.hnrEvery = Math.max(1, config.hnrEveryHops ?? 4);
    this.hnrResampler = new Resampler(sr, this.hnrRate, this.pitchWindow);
    this.hnrWide = new Float64Array(this.hnrResampler.outputCount);
    this.hnrSamples = new Float32Array(this.hnrResampler.outputCount);
  }

  reset(): void {
    this.total = 0; this.lastEmit = 0; this.hopCount = 0; this.hnrHold = null; this.voicedRun = 0; this.tracker.reset(); this.formants.reset?.(); this.ring.fill(0);
  }

  push(block: Float32Array): FrameResult | null {
    const n = this.ring.length;
    const start = block.length > n ? block.length - n : 0;
    for (let i = start; i < block.length; i += 1) this.ring[(this.total + i) % n] = block[i];
    this.total += block.length;
    const filled = Math.min(this.total, n);
    if (filled < Math.max(this.pitchWindow, this.formantWindow) || this.total - this.lastEmit < this.hopSamples) return null;
    this.lastEmit = this.total;
    return this.analyze();
  }

  private latest(count: number, out: Float32Array): Float32Array {
    const n = this.ring.length, from = this.total - count;
    for (let i = 0; i < count; i += 1) out[i] = this.ring[(from + i) % n];
    return out;
  }

  private dropHnr(): null { this.hnrHold = null; return null; }

  private updateHnr(pitchSamples: Float32Array): number | null {
    if (this.hopCount % this.hnrEvery === 0 || this.hnrHold === null) {
      this.hnrResampler.process(pitchSamples, 0, pitchSamples.length, this.hnrWide);
      for (let i = 0; i < this.hnrWide.length; i += 1) this.hnrSamples[i] = this.hnrWide[i];
      this.hnrHold = this.pitch.harmonicity(this.hnrSamples, this.hnrRate);
    }
    return this.hnrHold;
  }

  private analyze(): FrameResult {
    this.hopCount += 1;
    const sr = this.config.sampleRate;
    const pitchSamples = this.latest(this.pitchWindow, this.pitchScratch);
    let sum = 0;
    for (let i = pitchSamples.length - this.hopSamples; i < pitchSamples.length; i += 1) sum += pitchSamples[i] * pitchSamples[i];
    const levelDb = 10 * Math.log10(Math.max(sum / this.hopSamples, 1e-12));
    const audible = levelDb > this.silenceDb;

    const f0Hz = audible ? this.tracker.update(this.pitch.pitch(pitchSamples, sr)) : this.tracker.update(null);
    const hnrDb = f0Hz === null ? this.dropHnr() : this.updateHnr(pitchSamples);
    const voiced = f0Hz !== null;
    this.voicedRun = voiced ? this.voicedRun + 1 : 0;
    let formants = audible ? this.formants.estimate(this.latest(this.formantWindow, this.formantScratch), voiced) : [];
    if (!voiced && (this.config.formantsNeedVoicing ?? true)) formants = [];
    else if (voiced && this.voicedRun < (this.config.formantOnsetFrames ?? 3)) formants = [];

    const spectrum = new Float32Array(this.spectrumRows);
    this.spectrum.compute(this.latest(this.spectrum.windowSamples, this.spectrumScratch), spectrum);

    const theoreticalHz: (number | null)[] = [];
    const peaks: (HarmonicPeak | null)[] = [];
    if (f0Hz !== null) this.peaks.prepare(this.latest(this.peaks.windowSamples, this.narrowScratch));
    for (let k = 1; k <= this.partialCount; k += 1) {
      theoreticalHz.push(f0Hz === null ? null : f0Hz * k);
      peaks.push(f0Hz === null ? null : this.peaks.peakNear(f0Hz * k));
    }
    return { timeS: this.total / sr, levelDb, f0Hz, hnrDb, formants, theoreticalHz, peaks, spectrum };
  }
}

/**
 * Single-frame raw autocorrelation F0 has octave errors, onset glitches (aspiration noise at voicing
 * start can read as a 400-500 Hz "pitch") and one-frame dropouts. A new track must be confirmed by
 * `startFrames` consistent frames; a young track is corrected after `startFrames`, a mature one
 * only after `persistFrames`; one- or two-frame gaps are bridged.
 */
export class PitchTracker {
  private current: number | null = null;
  private pending: number | null = null;
  private pendingCount = 0;
  private misses = 0;
  private age = 0;

  constructor(
    private readonly maxJumpOctaves = 0.4,
    private readonly persistFrames = 3,
    private readonly maxGapFrames = 2,
    private readonly startFrames = 2,
    private readonly youngFrames = 6
  ) {}

  reset(): void { this.current = this.pending = null; this.pendingCount = this.misses = this.age = 0; }

  update(f0: number | null): number | null {
    if (f0 === null || !Number.isFinite(f0)) {
      this.misses += 1;
      this.pending = null; this.pendingCount = 0;
      if (this.misses > this.maxGapFrames) { this.current = null; this.age = 0; }
      return this.current;
    }
    this.misses = 0;
    if (this.current !== null && this.near(f0, this.current)) {
      this.current = f0; this.age += 1; this.pending = null; this.pendingCount = 0;
      return f0;
    }
    if (this.pending !== null && this.near(f0, this.pending)) this.pendingCount += 1;
    else { this.pending = f0; this.pendingCount = 1; }
    const needed = this.current === null || this.age < this.youngFrames ? this.startFrames : this.persistFrames;
    if (this.pendingCount >= needed) {
      this.current = f0; this.age = this.pendingCount; this.pending = null; this.pendingCount = 0;
      return f0;
    }
    return this.current;
  }

  private near(a: number, b: number): boolean { return Math.abs(Math.log2(a / b)) <= this.maxJumpOctaves; }
}
