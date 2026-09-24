# Real-time Vocal Analysis

A browser prototype for live vocal feedback: rolling spectrogram, fundamental
frequency (F0), and harmonic guides from the microphone.

## MVP

- Capture microphone audio with `getUserMedia`.
- Process frames in an `AudioWorklet` / ring buffer.
- Render a 20–40 ms STFT spectrogram with a ~10 ms hop.
- Estimate F0 and show eight `n × F0` harmonic guides.
- Keep visual latency below 100 ms where practical.

Formant analysis (LPC/Burg) and measured harmonic peaks come after the core
audio and rendering loop is stable.

## Scope and licensing

Praat is a research reference, not a code dependency. Its source is GPL-2.0-or-later;
this project will independently implement the relevant DSP techniques (FFT/STFT,
pitch tracking, optional LPC) or use appropriately licensed dependencies.

Reference note: `../praat-realtime-vocal-analysis-research.md` in the shared
Krusty Krab folder.

## Planned structure

```text
src/        browser application
tests/      DSP and UI tests
docs/       decisions and experiments
```

## Status

Repository scaffolded. No application code yet.
