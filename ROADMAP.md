# Harmonic Lens roadmap

## Product boundary

A real-time browser visualizer for singing voice: microphone input,
spectrogram, F0, harmonic guides, and later formants. It is not a browser clone
of the full Praat desktop application.

## Licensing rule

This repository is GPL-2.0-or-later. Code imported or adapted from Praat must:

1. retain upstream copyright and GPL notices;
2. name the Praat repository commit and original path in a file header;
3. remain in an isolated `src/dsp/praat/` module where feasible;
4. be covered by regression tests against reference recordings.

No source is copied until its dependency chain and provenance are understood.

## Milestone 0 — establish the reference baseline

- Clone Praat into a non-versioned `reference/praat/` checkout at a pinned commit. **Done:** `v7.0.02` / `6f3da9ef1d8cce0d5684afc104d02888dfc71b25`.
- Map the minimal dependencies of `fon/Sound_and_Spectrogram.cpp`. **Done:** [`docs/praat-spectrogram-manifest.md`](docs/praat-spectrogram-manifest.md).
- Add deterministic legal fixtures + fixed native/WASM comparison contract. **Done:** [Praat golden foundation](docs/praat-golden.md). Consented voice recordings remain future, external-to-Git work.
- Write a dependency/provenance manifest before porting a line.

**Done when:** we can identify exactly what is needed for a spectrogram port. Dependency/provenance baseline complete; consented regression fixtures remain required before importing derived source.

## Milestone 1 — visible audio loop

- Scaffold a TypeScript/Vite application.
- Request microphone access and stream frames through an `AudioWorklet`.
- Draw a rolling Canvas spectrogram.
- Expose frame rate, sample rate, and end-to-end latency diagnostics.

**Done when:** a sustained sung note visibly produces a stable waterfall in a
local browser session.

## Milestone 2 — Praat-derived spectrogram

- Run pinned full-barren Emscripten probe before selecting/extracting WASM closure; see [`docs/praat-wasm-probe.md`](docs/praat-wasm-probe.md). Current sandbox blocker: no `emcc`/`em++`.
- Port/adapt the selected Praat spectrogram path and dependencies into
  `src/dsp/praat/` (TypeScript or C++ compiled to WASM, based on the dependency map).
- Compare time/frequency bins and levels with the pinned Praat reference.
- Document any deliberate divergence.

**Done when:** automated fixtures match an agreed tolerance and the browser
renderer stays responsive.

## Milestone 3 — pitch and harmonics

- Map `fon/Sound_to_Pitch.cpp` before implementation.
- Extend dependency map only after full-barren Emscripten probe produces exact build evidence.
- Port the minimal pitch path and publish F0 confidence.
- Render eight `n × F0` guides, then measured spectral peaks.
- Exercise octave jumps, breathy voice, low registers, and fast pitch changes.

**Done when:** F0 and guides remain useful for normal singing at practical
latency (target: under 100 ms for visual feedback).

## Milestone 4 — formants and usable sessions

- Evaluate the LPC/Burg path from `fon/Sound_to_Formant.cpp`.
- Add F1/F2 only if pitch/spectrogram are stable.
- Add calibration, pause/reset, recording/export, and a legible control panel.

## First working session

1. Pin Praat upstream commit and create dependency/provenance manifest. **Done:** see [`docs/praat-spectrogram-manifest.md`](docs/praat-spectrogram-manifest.md).
2. Scaffold the microphone + Canvas loop without importing DSP code yet.
3. Inspect the spectrogram dependency graph.
4. Choose TypeScript port versus minimal C++/WASM bridge based on that graph.

This ordering makes the first browser view immediately testable while keeping
the GPL-derived core auditable.
