import assert from "node:assert/strict";
import test from "node:test";
import { AnalysisWindowBuffer } from "../src/dsp/spectrogram-backend";
import { PraatRuntimeBackend } from "../src/dsp/praat-runtime-backend";
import { mapWorkerAnalysis } from "../src/dsp/praat-runtime-protocol";

test("window buffer copies overlapping fixed windows", () => {
  const buffer = new AnalysisWindowBuffer(4, 2), windows: number[][] = [];
  buffer.push(Float32Array.from([1, 2, 3, 4, 5, 6]));
  buffer.drain(48_000, (window) => windows.push([...window.samples]));
  assert.deepEqual(windows, [[1, 2, 3, 4], [3, 4, 5, 6]]);
});

test("worker result maps only finite fields and aligned peaks", () => {
  const result = mapWorkerAnalysis({ f0Hz: 100, hnrDb: Number.NaN, measuredPeaks: [{ frequencyHz: 101, levelDb: -12 }, { frequencyHz: Number.NaN, levelDb: -20 }] }, 3);
  assert.deepEqual(result.theoreticalPeaksHz, [100, 200, 300]);
  assert.equal(result.hnrDb, null);
  assert.deepEqual(result.measuredPeaks, [{ frequencyHz: 101, levelDb: -12 }, null, null]);
});

test("bounded overload drops newest request without unbounded Worker posts", async () => {
  const worker = new FakeWorker();
  const backend = new PraatRuntimeBackend({ partialCount: 2, maxInFlight: 1, workerFactory: () => worker as unknown as Worker });
  worker.emit({ type: "ready" });
  const first = backend.analyze({ samples: Float32Array.from([1, 2]), sampleRate: 48_000 });
  const dropped = await backend.analyze({ samples: Float32Array.from([3, 4]), sampleRate: 48_000 });
  assert.equal(worker.requests, 1); assert.equal(backend.state, "overloaded"); assert.equal(dropped.f0Hz, null);
  worker.emit({ type: "result", id: 1, analysis: { f0Hz: 120, hnrDb: 10, measuredPeaks: [] } });
  assert.equal((await first).f0Hz, 120); assert.equal(backend.state, "ready");
});

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  requests = 0;
  postMessage(message: { type: string }): void { if (message.type === "analyze") this.requests += 1; }
  terminate(): void {}
  emit(data: unknown): void { this.onmessage?.({ data } as MessageEvent); }
}
