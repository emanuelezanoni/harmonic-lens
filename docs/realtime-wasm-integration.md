# Realtime WASM integration seam

The current `AudioWorkletProcessor` remains capture-only. It copies each native
render quantum into a `Float32Array` and transfers that buffer to the UI thread;
it does not load, instantiate, or call WASM.

`AnalysisWindowBuffer` in `src/dsp/spectrogram-backend.ts` is the UI-thread
adapter. It maintains a fixed circular buffer and emits a copied `windowSize`
sample window every `hopSize` samples. Current settings are 2048 samples and a
512-sample hop. Its capacity is two windows; under UI overload it discards the
oldest samples, preserving recency instead of allowing unbounded queued audio.

`PraatRuntimeBackend` bundles `praat-analysis-worker.ts`; it instantiates
configured pinned artifact URLs only in that Worker. Default deployment URLs are
`/praat-wasm/praat-spectrogram.js` and
`/praat-wasm/praat-pitch-harmonicity.js`. Release packaging must place their
matching Emscripten `.wasm` files beside them. Release artifacts are tracked in
`public/praat-wasm/` and hash-locked by `public/praat-wasm/manifest.json`;
source rebuild output remains ignored. Provenance/pin rules in
`praat-spectrogram-manifest.md` apply.

The backend copies before transfer, bounds in-flight analysis (default two),
returns empty analysis on overload, and exposes `loading`, `ready`, `failed`,
`overloaded`, `closed`. Worker calls use ABI preflight/capacity calls for
spectrogram, raw-AC pitch, CC HNR; final analysis-window track values map to
`AnalysisResult`. No `SharedArrayBuffer` dependency. Live renderer uses this
backend when ready for F0/HNR/measured peaks; browser FFT remains Canvas
waterfall renderer and fallback during loading/failure/overload.

Before replacing Canvas FFT waterfall, compare backend metadata (`frame_count`,
`bin_count`, `first_frame_time_seconds`, `time_step_seconds`,
`first_frequency_hz`, `frequency_step_hz`) and time-major power layout against
the committed ABI/golden fixtures.
