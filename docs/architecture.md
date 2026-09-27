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

The browser scaffold keeps the `AudioWorkletProcessor` minimal: it averages all
delivered input channels into one mono frame, then posts that frame to the main
thread. It allocates one transferable frame per render quantum. The main thread owns the
temporary ring buffer, Hann window, pragmatic radix-2 FFT, Canvas waterfall, and
diagnostic counters. A zero-gain sink keeps the Web Audio graph rendered while
preventing microphone monitoring/feedback.

This code is original browser integration/DSP scaffolding. No Praat source is
copied or adapted in Milestone 1; future Praat-derived files must follow the
provenance header and isolation rules in `ROADMAP.md`.

## Harmonic slice

Each completed STFT frame feeds bounded F0 estimation and H1–H8 measurement.
For each enabled partial, `n × F0` produces theoretical guide position. Peak
search stays local (±2 FFT bins), applies parabolic-bin refinement, reports
frequency + approximate dBFS, and draws separate solid caps around measured
peak. Faint guide centre remains theoretical even when measured peak matches.
Missing or
low-confidence F0 produces no harmonic measurements; prior values never carry
forward. This remains original browser DSP, not Praat-equivalent analysis.
