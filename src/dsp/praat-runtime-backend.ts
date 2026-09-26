import { emptyAnalysisResult, type AnalysisResult } from "../analysis-result";
import type { SpectrogramBackend, SpectrogramWindow } from "./spectrogram-backend";
import { defaultPraatArtifactUrls, mapWorkerAnalysis, type PraatArtifactUrls, type RuntimeRequest, type RuntimeResponse } from "./praat-runtime-protocol";

export type RuntimeBackendState = "loading" | "ready" | "failed" | "overloaded" | "closed";
export type RuntimeBackendOptions = {
  partialCount: number;
  maxInFlight?: number;
  artifactUrls?: PraatArtifactUrls;
  workerFactory?: () => Worker;
  onStateChange?: (state: RuntimeBackendState, detail?: string) => void;
};

/**
 * Main-thread queue boundary. AudioWorklet never instantiates/calls Praat.
 * `analyze` copies input before transfer and bounds outstanding work.
 */
export class PraatRuntimeBackend implements SpectrogramBackend {
  state: RuntimeBackendState = "loading";
  private readonly worker: Worker;
  private readonly pending = new Map<number, { resolve: (value: AnalysisResult) => void; reject: (reason: Error) => void }>();
  private readonly maxInFlight: number;
  private nextId = 1;

  constructor(private readonly options: RuntimeBackendOptions) {
    this.maxInFlight = options.maxInFlight ?? 2;
    if (!Number.isInteger(this.maxInFlight) || this.maxInFlight < 1) throw new Error("maxInFlight must be a positive integer.");
    this.worker = options.workerFactory?.() ?? new Worker(new URL("./praat-analysis-worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<RuntimeResponse>) => this.receive(event.data);
    this.worker.onerror = (event) => this.fail(event.message || "Praat analysis worker failed.");
    this.worker.postMessage({ type: "init", artifactUrls: options.artifactUrls ?? defaultPraatArtifactUrls });
  }

  analyze(window: SpectrogramWindow): Promise<AnalysisResult> {
    if (this.state === "failed" || this.state === "closed") return Promise.reject(new Error(`Praat runtime is ${this.state}.`));
    if (this.pending.size >= this.maxInFlight) {
      this.setState("overloaded", "bounded queue full; newest window dropped");
      return Promise.resolve(emptyAnalysisResult(this.options.partialCount));
    }
    const samples = new Float32Array(window.samples); // worker owns transfer copy only.
    const id = this.nextId++;
    return new Promise<AnalysisResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const message: RuntimeRequest = { type: "analyze", id, samples, sampleRate: window.sampleRate, partialCount: this.options.partialCount };
      this.worker.postMessage(message, [samples.buffer]);
    });
  }

  close(): void {
    if (this.state === "closed") return;
    this.worker.terminate();
    this.failPending(new Error("Praat runtime closed."));
    this.setState("closed");
  }

  private receive(message: RuntimeResponse): void {
    if (message.type === "ready") { this.setState("ready"); return; }
    if (message.type === "failure") { this.fail(message.message); return; }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (this.state === "overloaded") this.setState("ready");
    pending.resolve(mapWorkerAnalysis(message.analysis, this.options.partialCount));
  }

  private fail(message: string): void {
    if (this.state === "closed") return;
    this.failPending(new Error(message));
    this.setState("failed", message);
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private setState(state: RuntimeBackendState, detail?: string): void {
    this.state = state;
    this.options.onStateChange?.(state, detail);
  }
}
