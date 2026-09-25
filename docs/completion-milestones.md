# Completion milestones

This document defines when the current product-integration effort can be
called complete. A code commit, a wrapper, or a design seam is not itself a
completion criterion.

## M1 — Deterministic DSP evidence (complete)

- Native versus WASM spectrogram comparison passes for every committed fixture.
- Native versus WASM raw-AC pitch and CC harmonicity comparison passes for
  every committed fixture at the manifest tolerances.
- The wrappers' Node/WASM smoke tests pass.

Exit evidence:

```sh
npm run praat:golden:compare -- --analysis spectrogram --candidate analysis-output/praat-wasm
npm run praat:golden:compare -- --analysis pitch --candidate analysis-output/praat-wasm-pitch-harmonicity
npm run praat:golden:compare -- --analysis harmonicity --candidate analysis-output/praat-wasm-pitch-harmonicity
```

## M2 — Runtime analysis backend

- A Worker (never the `AudioWorkletProcessor` render callback) loads the
  committed/generated WASM artifacts.
- It consumes bounded copied analysis windows and produces the existing
  `AnalysisResult` contract, including F0, HNR, and measured peaks.
- It has explicit readiness, failure, and bounded-overload behaviour.

Exit evidence: automated unit tests for windowing/message mapping plus a
build that proves the Worker is bundled.

## M3 — Live renderer integration

- The application selects the WASM backend once it is ready.
- The existing browser FFT path is used only while WASM loads or after an
  explicit WASM failure; the UI reports that state.
- Start/stop/restart do not leak a Worker, detach owned buffers, or retain
  microphone data.

Exit evidence: deterministic integration test for backend selection and a
manual microphone run following the README checklist.

## M4 — Release candidate

- `npm ci`, `npm run build`, fixture checks, and all M1 comparators pass from
  a fresh clone.
- Linux desktop package builds; start/stop and microphone permission behavior
  are manually exercised in Electron.
- README and verification status accurately name the active runtime backend
  and residual platform-only release limitations.

Only M4 permits the label **product ready**. A blocker at any milestone must
state the exact failing command and leave the preceding milestone green.
