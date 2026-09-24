# Harmonic Lens

A GPL-2.0-or-later browser tool for live vocal feedback: rolling spectrogram,
fundamental frequency (F0), and harmonic guides from the microphone.

## MVP

- Capture microphone audio with `getUserMedia`.
- Process frames in an `AudioWorklet` / ring buffer.
- Render a 20–40 ms STFT spectrogram with a ~10 ms hop.
- Estimate F0 with browser-native spectral harmonic summation; show eight `n × F0` guides.
- Keep visual latency below 100 ms where practical.

Formant analysis (LPC/Burg) comes after core audio, harmonic tracking, and
rendering loop stabilize.

## Scope and licensing

Harmonic Lens will selectively port/adapt relevant GPL-2.0-or-later Praat DSP
code. It is therefore licensed as GPL-2.0-or-later. Every derived source file
must retain its upstream copyright notices and name its Praat source path and
commit in a provenance header. The UI and browser integration remain original.

See [ROADMAP.md](ROADMAP.md) for the extraction and validation plan.
Pinned upstream provenance and spectrogram dependency boundary: [docs/praat-spectrogram-manifest.md](docs/praat-spectrogram-manifest.md). The local `reference/praat/` checkout is intentionally ignored.

## Planned structure

```text
src/        browser application
tests/      DSP and UI tests
docs/       decisions and experiments
```

## Local development

Requirements: Node.js 20 or newer.

```sh
npm ci
npm run build
npm run dev
```

Open the printed `http://localhost:5173` URL, press **Start microphone**, and
allow microphone access. Stop server with `Ctrl-C`.
The first implementation uses browser-native Web Audio APIs and an original
TypeScript FFT path for the live display; no Praat source has been imported yet.
Use `localhost` or HTTPS: browsers block microphone access from insecure origins.
The capture graph terminates in a zero-gain node, so microphone input is never
played through speakers.

## Harmonic visualization MVP

Eight stable-colour H1–H8 tracks roll with spectrogram. Faint one-pixel marks
are theoretical `n × F0` guides; solid coloured caps around a guide/peak centre
are independently measured local spectral peaks. Each measured peak searches
±2 FFT bins around guide, then uses parabolic-bin refinement. Table keeps all eight track states;
each accessible toggle controls one track and exposes `aria-pressed` state.
Live columns separate guide frequency, measured-peak frequency, approximate
dBFS level, and On/Off state.

F0 uses bounded renderer-side spectral harmonic summation over 70–400 Hz. It
is MVP browser analysis, not Praat-equivalent. `No pitch / low confidence`
clears guide/peak values for current frame; disabled tracks also show `--`.
No Praat source imported.

Manual check: run `npm run dev`, permit microphone, sustain voice or tone near
100–300 Hz, confirm faint guide trails, solid measured-peak marks, updating
rows. Toggle H1/H8 via mouse or keyboard and confirm state becomes Off, values
clear, new track pixels stop.
Use silence/noise → `No pitch / low confidence` + `--` measurements. Repeat in
browser and Electron (`npm run dev:desktop`).

## Desktop shell

Electron packages same Vite renderer for macOS, Windows, Linux. Desktop runtime
uses a unique OS-temporary directory for Chromium `userData`, cache, session
data; deletes it on normal application exit. Harmonic Lens stores neither user
configuration nor recordings.

```sh
npm ci
npm run dev:desktop
npm run package
```

`npm run package` config targets macOS ZIP, Windows portable `.exe`, Linux
AppImage. Native release CI runs every target from same `src/` renderer via
`npm run build` → `dist/`; it uploads these x64 artifacts:

- `harmonic-lens-<version>-mac-x64.zip`
- `harmonic-lens-<version>-win-x64.exe`
- `harmonic-lens-<version>-linux-x64.AppImage`

Push tag `v<version>` to create GitHub release containing all three. Unsigned
artifacts may trigger macOS Gatekeeper, Windows SmartScreen, or Linux desktop
trust warnings. macOS prompts for microphone permission; Windows/Linux prompt
behavior depends on desktop/portal configuration. Deny/revoke permission → no
live capture.

Build host/package tooling determines which artifacts can be built; use
platform-native CI or hosts for release validation. Linux-only package check:

```sh
npm run package:linux
```

Release signing and notarization are outside current packaging config. Runtime
profile/cache/session paths use OS temporary storage and delete on normal exit:
no settings, recordings, or browser state intentionally persist. Crash/forced
kill can leave temporary files until OS cleanup.

Validation:

```sh
npm run build
```

No automated test suite exists yet; `npm test` is intentionally unavailable.
Milestone 2 must add pinned-Praat parity fixtures/tests before derived DSP code
is imported.

## Status

Milestone 1 foundation scaffolded:

- TypeScript/Vite browser application.
- Microphone capture through `getUserMedia`.
- `AudioWorklet` frame forwarding.
- Rolling Canvas spectrogram with visible sample-rate, frame-rate, latency, and
  level diagnostics.
