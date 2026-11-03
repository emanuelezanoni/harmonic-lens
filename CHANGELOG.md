# Changelog

## 0.1.0-beta.1

First public beta. Everything before it (0.1.0 to 0.1.6) was internal.

- Real-time analysis pipeline in one worker: F0 and HNR (Praat WASM), formants F1-F4 (Burg, TypeScript),
  Gaussian spectrogram, harmonic guides.
- Formant tracker: slot assignment with temporal continuity, median filter, voicing gate.
- UI: single-screen layout, F1 x F2 vowel space with indicative Italian targets, level meter, connected formant
  lines, collapsible panels, settings remembered between runs.
- Level calibration to dB SPL per microphone, CSV session export, live microphone switching.
- Desktop apps: relative asset paths (the 0.1.x packages opened to a blank window), ad-hoc signed universal
  macOS build, Windows portable, Linux AppImage; CI smoke test of the real Electron app with a fake microphone.
- Benchmarks and e2e tools against Hillenbrand vowels, Praat, running speech and own recordings.
