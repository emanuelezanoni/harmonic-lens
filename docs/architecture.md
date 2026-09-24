# Initial architecture

```text
Microphone → AudioWorklet → ring buffer → analysis → renderer
                                      ├─ STFT / spectrogram
                                      ├─ F0 tracker
                                      └─ harmonic guides / peak measurements
```

The first implementation should keep the audio callback small and transfer
analysis/rendering work safely to the main thread or a worker. Formant analysis
is deliberately deferred until pitch and rendering are reliable.

## Milestone 1 foundation

The browser scaffold keeps the `AudioWorkletProcessor` minimal: it copies input
channel frames and posts them to the main thread. The main thread owns the
temporary ring buffer, Hann window, pragmatic radix-2 FFT, Canvas waterfall, and
diagnostic counters.

This code is original browser integration/DSP scaffolding. No Praat source is
copied or adapted in Milestone 1; future Praat-derived files must follow the
provenance header and isolation rules in `ROADMAP.md`.
