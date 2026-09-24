# Harmonic Lens

A GPL-2.0-or-later browser tool for live vocal feedback: rolling spectrogram,
fundamental frequency (F0), and harmonic guides from the microphone.

## MVP

- Capture microphone audio with `getUserMedia`.
- Process frames in an `AudioWorklet` / ring buffer.
- Render a 20–40 ms STFT spectrogram with a ~10 ms hop.
- Estimate F0 and show eight `n × F0` harmonic guides.
- Keep visual latency below 100 ms where practical.

Formant analysis (LPC/Burg) and measured harmonic peaks come after the core
audio and rendering loop is stable.

## Scope and licensing

Harmonic Lens will selectively port/adapt relevant GPL-2.0-or-later Praat DSP
code. It is therefore licensed as GPL-2.0-or-later. Every derived source file
must retain its upstream copyright notices and name its Praat source path and
commit in a provenance header. The UI and browser integration remain original.

See [ROADMAP.md](ROADMAP.md) for the extraction and validation plan.

## Planned structure

```text
src/        browser application
tests/      DSP and UI tests
docs/       decisions and experiments
```

## Local development

Requirements: Node.js 20 or newer.

```sh
npm install
npm run dev
```

Open the Vite URL, press **Start microphone**, and allow microphone access.
The first implementation uses browser-native Web Audio APIs and an original
TypeScript FFT path for the live display; no Praat source has been imported yet.

Build check:

```sh
npm run build
```

## Status

Milestone 1 foundation scaffolded:

- TypeScript/Vite browser application.
- Microphone capture through `getUserMedia`.
- `AudioWorklet` frame forwarding.
- Rolling Canvas spectrogram with visible sample-rate, frame-rate, latency, and
  level diagnostics.
