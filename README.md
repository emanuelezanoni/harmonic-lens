# Harmonic Lens

GPL-2.0-or-later **real-time** vocal analyzer: the Praat-style view of your voice
(spectrogram, F0, formants F1-F4, HNR, harmonics) while you sing or speak, instead
of record-then-inspect.

## What it does

- Microphone via `getUserMedia` and an `AudioWorklet` (all channels averaged to mono,
  input never played back). The worklet sends audio straight to an analysis Worker;
  the main thread only paints.
- One analysis pipeline (`src/dsp/engine.ts`), ~10 ms hop, ~2 ms CPU per frame:
  - F0 and HNR from the pinned Praat v7.0.02 WASM (raw autocorrelation pitch, cross-correlation
    HNR). HNR runs on an 8 kHz decimated copy every 4th hop (the Praat call costs 35-100 ms at
    48 kHz); deliberate divergence, about 0.5 dB on voiced signals.
  - Formants: TypeScript port of Praat's Burg algorithm (`src/dsp/formants/`), validated against
    Praat 6.1.38 via parselmouth (median F1-F3 error under 0.15% on clean synthetic vowels).
  - Praat-style Gaussian spectrogram (wideband 5 ms for formants, narrowband 30 ms for harmonics),
    pre-emphasis from 50 Hz, selectable 0-3/5/8 kHz range.
  - Eight n x F0 harmonic guides with measured peaks; a pitch tracker bridges dropouts and rejects
    isolated octave jumps.
- UI: labelled Hz and time axes, F0 and F1-F4 tracks over the spectrogram, voice presets (max
  formant 5000/5500/7000 Hz), pause/resume.
- If the Praat WASM fails to load the UI says so (pitch/HNR off); there is no hidden fallback
  estimator. Spectrogram and formants keep running.
- Electron has `contextIsolation`, sandbox, no Node integration, temporary profile, audio-only
  permission for the trusted main page. No recordings or settings are persisted.

Formants F1-F4 are tracked over time (`src/dsp/formants/tracker.ts`): poles are assigned to slots by
dynamic programming with temporal continuity, a 3-frame median, and no history across unvoiced frames.

Not implemented: recording/export, calibration, saved settings, and a manually tested desktop release.

## End-to-end check

`tools/e2e/` drives the built app in headless Chromium with a fake microphone playing synthetic
vowels (a, i, u) and fails on regressions (F0 coverage, formants present, latency, frame rate):

```sh
python3 tools/e2e/synth_vowels.py /tmp/vowels
python3 tools/e2e/run_app.py /tmp/vowels.wav /tmp/run 9   # needs playwright + chromium; builds dist/ first
```

`tools/e2e/make_real_vowels.py` builds the same kind of fake-mic WAV from human recordings
(Hillenbrand et al. 1995, 1668 tokens with hand-checked formants; not vendored, fetch it separately).

## Formant benchmark

`tools/bench/hillenbrand-bench.ts` (steady-state point) and `tools/bench/hillenbrand-track-bench.ts`
(every frame of the vowel nucleus, cold start from the token onset) score F1-F3 against Hillenbrand's
measurements. Fraction of frames with >20 % error (`--raw` = unfiltered poles, no tracker):

| condition | raw poles | tracked |
|---|---|---|
| clean, voice type matched | 2.35 % | 1.46 % |
| voice type set wrong (`--max 5500` for all) | 3.82 % | 1.03 % |
| white noise, SNR 30 dB (`--snr 30`) | 2.56 % | 2.13 % |
| white noise, SNR 20 dB | 6.47 % | 6.53 % |

Real-microphone behaviour remains host-dependent and untested here.

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

## macOS Apple Silicon

`npm run package:mac` builds arm64 ZIP on macOS. `package:mac:x64` remains
available for Intel; `package:mac:universal` is optional when one combined
artifact is required. CI builds arm64 natively on GitHub's `macos-15` Apple
Silicon runner. This project has no native Node modules, so its JS/WASM payload
does not need per-architecture compilation.

Packaged `Info.plist` includes `NSMicrophoneUsageDescription`. Electron's main
process allows audio-only media requests from the exact top-level app page and,
on macOS, asks TCC for microphone access. A denial is not re-prompted: enable
Harmonic Lens in **System Settings → Privacy & Security → Microphone**, quit,
then reopen it. For local reset testing:

```sh
tccutil reset Microphone org.harmoniclens.app
```

No custom macOS entitlement file is included. Stock, non-Mac-App-Store Electron
does not require one for microphone capture. `build.mac.identity` is explicitly
`null`, keeping test/CI artifacts truly unsigned instead of implicitly ad-hoc
signed; this avoids a current electron-builder 26.0.13+ TCC/capture regression.
Artifacts are not notarized. Do not distribute them as trusted releases until
Developer ID signing/notarization replaces that setting. Physical-Mac checklist
and inspection commands: [macOS arm64 verification](docs/macos-arm64.md).

## Verification boundary

Native oracle, fixture hashes, WASM parity, runtime integration, packaging, and
manual-test boundaries: [verification status](docs/verification-status.md).
Praat provenance/ABI: [WASM probe](docs/praat-wasm-probe.md) and
[golden contract](docs/praat-golden.md). Product milestones: [ROADMAP.md](ROADMAP.md).
