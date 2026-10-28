/// <reference lib="webworker" />
import { AnalysisEngine, type PitchProvider } from "./engine";
import { FormantEstimator } from "./formants";
import { loadPraatPitchModule, PraatPitchHarmonicity } from "./praat-wasm";
import type { AnalysisSettings, AudioChunk, WorkerRequest, WorkerResponse } from "./analysis-protocol";

const noPitch: PitchProvider = { pitch: () => null, harmonicity: () => null };

let sampleRate = 0;
let provider: PitchProvider = noPitch;
let engine: AnalysisEngine | null = null;
let origin: number | null = null;
let settings: AnalysisSettings | null = null;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === "settings") {
      settings = message.settings;
      if (sampleRate) buildEngine();
      return;
    }
    sampleRate = message.sampleRate;
    settings = message.settings;
    buildEngine();
    message.audioPort.onmessage = (audio: MessageEvent<AudioChunk>) => onAudio(audio.data);
    try {
      provider = new PraatPitchHarmonicity(await loadPraatPitchModule(message.praatUrl));
      buildEngine();
      post({ type: "ready", praat: true });
    } catch (error) {
      // No silent second estimator: report degraded mode and keep spectrogram + formants running.
      provider = noPitch;
      post({ type: "ready", praat: false, detail: error instanceof Error ? error.message : "Praat WASM unavailable" });
    }
  } catch (error) {
    post({ type: "failure", message: error instanceof Error ? error.message : "Analysis worker failed." });
  }
};

function buildEngine(): void {
  if (!settings) return;
  engine = new AnalysisEngine(
    { sampleRate, spectrumMaxHz: settings.spectrumMaxHz, spectrumWindowS: settings.spectrumWindowS },
    provider,
    new FormantEstimator(sampleRate, { maxFormantHz: settings.maxFormantHz })
  );
  origin = null;
}

function onAudio(chunk: AudioChunk): void {
  if (!engine) return;
  try {
    origin ??= chunk.contextTimeS;
    const frame = engine.push(chunk.samples);
    if (frame) {
      const { spectrum } = frame;
      self.postMessage({ type: "frame", frame: { ...frame, audioTimeS: origin + frame.timeS, producedAtMs: performance.now() } } satisfies WorkerResponse, [spectrum.buffer]);
    }
  } catch (error) {
    post({ type: "failure", message: error instanceof Error ? error.message : "Analysis failed." });
  }
}

function post(message: WorkerResponse): void { self.postMessage(message); }
