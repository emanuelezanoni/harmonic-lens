import { Fft } from "./fft";

export type SpectrumOptions = {
  /** Physical Gaussian window length in seconds (Praat convention: analysed duration is twice this). */
  windowS: number;
  /** Highest frequency kept, Hz. */
  maxHz: number;
  /** Output rows, linearly spaced 0..maxHz. */
  rows: number;
  /** Pre-emphasis corner (Praat spectrogram default 50 Hz), 0 disables. */
  preEmphasisFromHz?: number;
};

/**
 * Praat-style spectrogram column: Gaussian window, 6 dB/octave pre-emphasis above a corner,
 * power in dB relative to full scale. Wideband (5 ms) shows formants; narrowband (~30 ms) shows harmonics.
 */
export class SpectrumAnalyzer {
  readonly rows: number;
  readonly windowSamples: number;
  private readonly fft: Fft;
  private readonly window: Float64Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly emphasis: number;
  private readonly norm: number;
  private readonly binHz: number;
  private readonly maxHz: number;

  constructor(private readonly sampleRate: number, options: SpectrumOptions) {
    this.rows = options.rows;
    this.maxHz = Math.min(options.maxHz, sampleRate / 2);
    this.windowSamples = Math.max(8, Math.round(2 * options.windowS * sampleRate));
    let size = 64;
    while (size < this.windowSamples * 2) size <<= 1; // zero-pad x2 for smooth interpolation
    this.fft = new Fft(size);
    this.re = new Float64Array(size);
    this.im = new Float64Array(size);
    this.binHz = sampleRate / size;
    this.window = new Float64Array(this.windowSamples);
    const mid = (this.windowSamples - 1) / 2, edge = Math.exp(-12);
    let sum = 0;
    for (let i = 0; i < this.windowSamples; i += 1) {
      const x = (i - mid) / this.windowSamples;
      this.window[i] = (Math.exp(-48 * x * x) - edge) / (1 - edge);
      sum += this.window[i];
    }
    this.norm = 1 / (sum * sum);
    this.emphasis = options.preEmphasisFromHz ? Math.exp((-2 * Math.PI * options.preEmphasisFromHz) / sampleRate) : 0;
  }

  /** `samples` is the most recent audio; at least windowSamples long. Writes dB into `out` (length rows). */
  compute(samples: Float32Array, out: Float32Array): void {
    const n = this.windowSamples, offset = samples.length - n;
    if (offset < 0) throw new Error("Not enough samples for spectrum window.");
    this.re.fill(0); this.im.fill(0);
    for (let i = 0; i < n; i += 1) {
      const prev = offset + i > 0 ? samples[offset + i - 1] : 0;
      this.re[i] = (samples[offset + i] - this.emphasis * prev) * this.window[i];
    }
    this.fft.transform(this.re, this.im);
    for (let r = 0; r < this.rows; r += 1) {
      const position = ((r + 0.5) / this.rows) * this.maxHz / this.binHz;
      const lo = Math.min(Math.floor(position), this.fft.size / 2 - 1), frac = position - lo;
      const p0 = this.re[lo] ** 2 + this.im[lo] ** 2, p1 = this.re[lo + 1] ** 2 + this.im[lo + 1] ** 2;
      out[r] = 10 * Math.log10((p0 * (1 - frac) + p1 * frac) * this.norm + 1e-12);
    }
  }
}

/** Parabolic-interpolated peak search of a magnitude-squared spectrum around a target frequency. */
export class PeakFinder {
  private readonly fft: Fft;
  private readonly window: Float64Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly binHz: number;
  private readonly gain: number;

  constructor(private readonly sampleRate: number, readonly windowSamples = 2048, fftSize = 8192) {
    this.fft = new Fft(fftSize);
    this.re = new Float64Array(fftSize);
    this.im = new Float64Array(fftSize);
    this.binHz = sampleRate / fftSize;
    this.window = new Float64Array(windowSamples);
    let sum = 0;
    for (let i = 0; i < windowSamples; i += 1) { this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSamples - 1))); sum += this.window[i]; }
    this.gain = 2 / sum;
  }

  /** Transform the latest windowSamples of `samples`; call before `peakNear`. */
  prepare(samples: Float32Array): void {
    const n = this.windowSamples, offset = samples.length - n;
    this.re.fill(0); this.im.fill(0);
    for (let i = 0; i < n; i += 1) this.re[i] = samples[offset + i] * this.window[i];
    this.fft.transform(this.re, this.im);
  }

  /** Strongest peak within ±toleranceRatio of targetHz; level in dBFS of a sinusoid amplitude. */
  peakNear(targetHz: number, toleranceRatio = 0.04): { frequencyHz: number; levelDb: number } | null {
    if (targetHz >= this.sampleRate / 2) return null;
    const half = this.fft.size / 2;
    const lo = Math.max(1, Math.floor((targetHz * (1 - toleranceRatio)) / this.binHz));
    const hi = Math.min(half - 2, Math.ceil((targetHz * (1 + toleranceRatio)) / this.binHz));
    let best = -1, bestMag = 0;
    for (let b = lo; b <= hi; b += 1) {
      const m = Math.hypot(this.re[b], this.im[b]);
      if (m > bestMag) { bestMag = m; best = b; }
    }
    if (best < 0 || bestMag === 0) return null;
    const a = Math.hypot(this.re[best - 1], this.im[best - 1]), c = Math.hypot(this.re[best + 1], this.im[best + 1]);
    const denom = a - 2 * bestMag + c;
    const offset = denom === 0 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom));
    return { frequencyHz: (best + offset) * this.binHz, levelDb: 20 * Math.log10(Math.max(bestMag * this.gain, 1e-9)) };
  }
}
