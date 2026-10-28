import type { FrameResult } from "./engine";

/** User-tunable analysis settings; changing any of them rebuilds the engine in the worker. */
export type AnalysisSettings = {
  /** Highest formant searched: ~5000 low voices, 5500 typical, ~7000 high/child voices (Praat guidance). */
  maxFormantHz: number;
  /** Spectrogram vertical extent in Hz. */
  spectrumMaxHz: number;
  /** 0.005 = wideband (formant bands), 0.03 = narrowband (resolved harmonics). */
  spectrumWindowS: number;
};

export const defaultSettings: AnalysisSettings = { maxFormantHz: 5500, spectrumMaxHz: 5000, spectrumWindowS: 0.005 };

export type WorkerRequest =
  | { type: "init"; sampleRate: number; praatUrl: string; settings: AnalysisSettings; audioPort: MessagePort }
  | { type: "settings"; settings: AnalysisSettings };

export type AnalysisFrame = FrameResult & {
  /** AudioContext time (s) of the newest analysed sample, for transport-latency measurement. */
  audioTimeS: number;
  /** Wall clock inside the worker when the frame was produced (performance.now). */
  producedAtMs: number;
};

export type WorkerResponse =
  | { type: "ready"; praat: boolean; detail?: string }
  | { type: "frame"; frame: AnalysisFrame }
  | { type: "failure"; message: string };

/** Message the AudioWorklet sends straight to the analysis worker. */
export type AudioChunk = { samples: Float32Array; contextTimeS: number };

/** Praat guidance: restrict the pitch search to the speaker's plausible range to avoid octave errors. */
export function pitchRangeFor(maxFormantHz: number): { floorHz: number; ceilingHz: number } {
  if (maxFormantHz <= 5000) return { floorHz: 70, ceilingHz: 350 };
  if (maxFormantHz <= 5500) return { floorHz: 75, ceilingHz: 500 };
  return { floorHz: 100, ceilingHz: 800 };
}
