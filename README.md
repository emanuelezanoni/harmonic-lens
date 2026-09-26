# Harmonic Lens

GPL-2.0-or-later live vocal visualizer: microphone capture, rolling Canvas
spectrogram, Praat WASM F0/HNR/harmonic peak analysis, and eight harmonic guides.

## Release-candidate scope

- Browser/Electron renderer captures microphone audio through `getUserMedia` and
  an `AudioWorklet`; input ends at zero gain, never speaker playback.
- Canvas waterfall remains browser-FFT rendered. A bounded Worker loads pinned
  Praat WASM for F0, CC harmonicity (HNR), and measured harmonic peaks; failure
  or overload falls back to browser FFT.
- Electron has `contextIsolation`, sandbox, no Node integration, temporary
  profile/cache/session storage, and grants only audio media to its trusted main
  page. Runtime state is removed on normal quit.
- No recordings, settings, calibration, formants, pause/reset, or export exist.
- Browser and Electron microphone sessions were **not manually tested for this
  release candidate**. Permission/device/portal behavior remains host-dependent.

## Deterministic verification

Requirements: Node.js 22.12+; Linux AppImage needs normal Electron Builder host
tools. Clean clone contains pinned browser artifacts in `public/praat-wasm/`.

```sh
npm ci --include=dev
npm test
npm run praat:fixtures:check
npm run praat:wasm:stage:check
npm run build
npm run package:linux
```

`npm run build` runs staged-WASM hash check first. `npm run
praat:wasm:stage` copies locally rebuilt artifacts from
`analysis-output/praat-wasm-wrapper/`, then checks hashes against
[`public/praat-wasm/manifest.json`](public/praat-wasm/manifest.json). Rebuilds
need pinned Praat `v7.0.02` / `6f3da9ef1d8cce0d5684afc104d02888dfc71b25` and
Emscripten `3.1.69`; changed output requires deliberate manifest review/update.

For local live use:

```sh
npm run dev
npm run dev:desktop
```

Use localhost or HTTPS. `npm run package:linux` produces
`release/Harmonic Lens-<version>.AppImage`; artifacts are unsigned.

## Verification boundary

Native oracle, fixture hashes, WASM parity, runtime integration, packaging, and
manual-test boundaries: [verification status](docs/verification-status.md).
Praat provenance/ABI: [WASM probe](docs/praat-wasm-probe.md) and
[golden contract](docs/praat-golden.md). Product milestones: [ROADMAP.md](ROADMAP.md).
