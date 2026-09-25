# Realtime WASM integration seam

The current `AudioWorkletProcessor` remains capture-only. It copies each native
render quantum into a `Float32Array` and transfers that buffer to the UI thread;
it does not load, instantiate, or call WASM.

`AnalysisWindowBuffer` in `src/dsp/spectrogram-backend.ts` is the UI-thread
adapter. It maintains a fixed circular buffer and emits a copied `windowSize`
sample window every `hopSize` samples. Current settings are 2048 samples and a
512-sample hop. Its capacity is two windows; under UI overload it discards the
oldest samples, preserving recency instead of allowing unbounded queued audio.

`SpectrogramBackend` is intentionally async: a future loader can instantiate
the committed `praat_spectrogram_v1` artifact off the audio render callback,
then send batches to a Worker or call WASM on a scheduled UI/worker task. It
must map a copied `Float32Array` to the ABI's planar channel input and obey the
two-call output-capacity protocol described in `praat-wasm-probe.md`. Output
power buffers may be transferred from Worker to renderer only after the backend
is ready; no `SharedArrayBuffer` dependency is assumed. The emitted input window
is never transferred while the ring owns it, preventing detached-buffer bugs.

Before switching the renderer, compare backend metadata (`frame_count`,
`bin_count`, `first_frame_time_seconds`, `time_step_seconds`,
`first_frequency_hz`, `frequency_step_hz`) and time-major power layout against
the committed ABI/golden fixtures. Keep browser FFT as the active backend until
those parity checks and an overload policy are accepted.
