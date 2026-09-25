/**
 * Main-thread boundary for interchangeable spectrogram implementations.
 *
 * The AudioWorklet only transfers render quanta.  This module assembles those
 * quanta into overlapping windows; a future Praat WASM backend is loaded and
 * called off the realtime render callback.
 */
export type SpectrogramWindow = {
  samples: Float32Array;
  sampleRate: number;
};

export interface SpectrogramBackend {
  analyze(window: SpectrogramWindow): Promise<void>;
}

export type SpectrogramBackendLoader = () => Promise<SpectrogramBackend>;

/**
 * Assemble fixed, overlapping analysis windows from transferable worklet
 * quanta. `drain` deliberately copies each emitted window: its backing ring
 * remains owned by the UI thread and can never be detached by a WASM/worker
 * transfer. The consumer decides whether to retain or transfer the copy.
 */
export class AnalysisWindowBuffer {
  private readonly samples: Float32Array;
  private read = 0;
  private write = 0;
  private available = 0;

  constructor(
    readonly windowSize: number,
    readonly hopSize: number,
  ) {
    if (!Number.isInteger(windowSize) || !Number.isInteger(hopSize) || windowSize < 1 || hopSize < 1 || hopSize > windowSize) {
      throw new Error("Analysis window and hop must be positive integers with hop <= window.");
    }
    // Enough for a worklet quantum plus one complete analysis window.
    this.samples = new Float32Array(windowSize * 2);
  }

  push(quantum: Float32Array): void {
    for (const sample of quantum) {
      if (this.available === this.samples.length) {
        // This indicates the UI cannot keep up; preserve the newest audio.
        this.read = (this.read + 1) % this.samples.length;
        this.available -= 1;
      }
      this.samples[this.write] = sample;
      this.write = (this.write + 1) % this.samples.length;
      this.available += 1;
    }
  }

  drain(sampleRate: number, consume: (window: SpectrogramWindow) => void): void {
    while (this.available >= this.windowSize) {
      const window = new Float32Array(this.windowSize);
      for (let index = 0; index < this.windowSize; index += 1) {
        window[index] = this.samples[(this.read + index) % this.samples.length];
      }
      consume({ samples: window, sampleRate });
      this.read = (this.read + this.hopSize) % this.samples.length;
      this.available -= this.hopSize;
    }
  }
}
