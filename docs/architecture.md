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
