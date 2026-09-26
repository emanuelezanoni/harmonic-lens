import { emptyAnalysisResult, type AnalysisResult, type MeasuredPeak } from "../analysis-result";

/** GPL-2.0-or-later Praat artifact endpoints. Keep artifacts pinned to docs pin. */
export type PraatArtifactUrls = {
  spectrogram: string;
  pitchHarmonicity: string;
};

export const defaultPraatArtifactUrls: PraatArtifactUrls = {
  spectrogram: "/praat-wasm/praat-spectrogram.js",
  pitchHarmonicity: "/praat-wasm/praat-pitch-harmonicity.js"
};

export type WorkerAnalysis = {
  f0Hz: number | null;
  hnrDb: number | null;
  measuredPeaks: Array<MeasuredPeak | null>;
};

export type RuntimeRequest = {
  type: "analyze";
  id: number;
  samples: Float32Array;
  sampleRate: number;
  partialCount: number;
};

export type RuntimeResponse =
  | { type: "ready" }
  | { type: "result"; id: number; analysis: WorkerAnalysis }
  | { type: "failure"; message: string };

export function mapWorkerAnalysis(analysis: WorkerAnalysis, partialCount: number): AnalysisResult {
  const result = emptyAnalysisResult(partialCount);
  const f0Hz = finiteOrNull(analysis.f0Hz);
  result.f0Hz = f0Hz;
  result.hnrDb = finiteOrNull(analysis.hnrDb);
  if (f0Hz !== null) {
    result.theoreticalPeaksHz = Array.from({ length: partialCount }, (_, index) => f0Hz * (index + 1));
  }
  result.measuredPeaks = Array.from({ length: partialCount }, (_, index) => {
    const peak = analysis.measuredPeaks[index];
    return peak && Number.isFinite(peak.frequencyHz) && Number.isFinite(peak.levelDb) ? peak : null;
  });
  return result;
}

function finiteOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}
