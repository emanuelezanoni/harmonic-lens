/**
 * Renderer-facing analysis contract.
 *
 * A future Praat WASM backend supplies this shape directly.  The current FFT
 * implementation is deliberately only an adapter to it, so presentation code
 * does not depend on a particular pitch or peak-finding implementation.
 */
export type MeasuredPeak = {
  frequencyHz: number;
  levelDb: number;
};

export type AnalysisResult = {
  /** Fundamental frequency, or null when the frame has no usable pitch. */
  f0Hz: number | null;
  /** Confidence of f0Hz in [0, 1], or null when the backend cannot provide it. */
  confidence: number | null;
  /** Harmonics-to-noise ratio in dB, or null when not measured by the backend. */
  hnrDb: number | null;
  /** The n × F0 guides, indexed from H1. */
  theoreticalPeaksHz: readonly (number | null)[];
  /** Peak measurements corresponding to theoreticalPeaksHz, indexed from H1. */
  measuredPeaks: readonly (MeasuredPeak | null)[];
};

export function emptyAnalysisResult(partialCount: number): AnalysisResult {
  return {
    f0Hz: null,
    confidence: null,
    hnrDb: null,
    theoreticalPeaksHz: Array.from({ length: partialCount }, () => null),
    measuredPeaks: Array.from({ length: partialCount }, () => null)
  };
}
