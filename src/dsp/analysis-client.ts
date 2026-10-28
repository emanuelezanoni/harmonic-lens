import type { AnalysisFrame, AnalysisSettings, WorkerResponse } from "./analysis-protocol";

export type ClientEvents = {
  onFrame(frame: AnalysisFrame): void;
  onReady(praat: boolean, detail?: string): void;
  onFailure(message: string): void;
};

/** Main-thread handle: owns the worker and hands the audio MessagePort to the AudioWorklet. */
export class AnalysisClient {
  private readonly worker: Worker;
  readonly audioPort: MessagePort;

  constructor(sampleRate: number, settings: AnalysisSettings, private readonly events: ClientEvents, worker?: Worker) {
    this.worker = worker ?? new Worker(new URL("./analysis-worker.ts", import.meta.url), { type: "module" });
    const channel = new MessageChannel();
    this.audioPort = channel.port1; // transferred to the worklet by the caller
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === "frame") this.events.onFrame(message.frame);
      else if (message.type === "ready") this.events.onReady(message.praat, message.detail);
      else this.events.onFailure(message.message);
    };
    this.worker.onerror = (event) => this.events.onFailure(event.message || "Analysis worker crashed.");
    // praat-wasm/ ships next to index.html; resolve against the document so file:// and http:// both work.
    const praatUrl = new URL("praat-wasm/praat-pitch-harmonicity.js", document.baseURI).href;
    this.worker.postMessage({ type: "init", sampleRate, praatUrl, settings, audioPort: channel.port2 }, [channel.port2]);
  }

  updateSettings(settings: AnalysisSettings): void { this.worker.postMessage({ type: "settings", settings }); }

  close(): void { this.audioPort.close(); this.worker.terminate(); }
}
