# Praat WebAssembly build probe

## Result

Status: blocked before compile. 2026-09-24 sandbox: no `emcc`/`em++` on `PATH`; no sanctioned sandbox installer exposed. Native pinned oracle runnable. This is not successful WASM port.

Pin: `praat/praat` `v7.0.02`, `6f3da9ef1d8cce0d5684afc104d02888dfc71b25`; ignored checkout `reference/praat/`. Target DSP: `fon/Sound_and_Spectrogram.cpp:Sound_to_Spectrogram_e`; `fon/Sound_to_Pitch.cpp:Sound_to_Pitch_rawAc` → `Sound_to_Pitch_any`.

## Minimal-complexity probe

Unmodified upstream + barren graphics + no audio + Emscripten compiler/linker substitution. Tests compile/link before closure extraction. No DSP change, UI, realtime claim.

```sh
./scripts/praat-wasm-probe.sh
```

It checks tools + exact clean pin, then:

```sh
emmake make -C reference/praat \
  PRAAT_GRAPHICS=barren PRAAT_AUDIO=none PRAAT_COMPILER=clang \
  CC=emcc CXX=em++ LINKER_COMMAND='em++ -sENVIRONMENT=node' -j"$(nproc)"
node reference/praat/praat_barren.js --run scripts/praat-native-probe.praat
```

Success output shape: `spectrogram frames=... pitch frames=... Hz(frame 10)=...`. Proves upstream CLI Node-WASM only; not numeric parity, browser approval, wrapper validation. Save compiler version, command, `.js`/`.wasm` hashes, stdout under ignored `analysis-output/`.

Likely first failure: Linux Makefile native flags (`-no-pie`, pthread assumptions); no `PRAAT_COMPILER=emcc` branch. Record full error. Do not patch upstream DSP. Build-system adaptation needs review, clean-pin rerun.

## Proposed wrapper ABI

No wrapper source tracked/compiled. Opaque, malloc-free to JS, batch-only:

```c
typedef struct { const float *samples; int32_t channel_count; int32_t sample_count;
  double sample_interval_seconds; } praat_audio_input_v1;
typedef struct { int32_t frame_count; int32_t bin_count; double first_time_seconds;
  double time_step_seconds; double first_frequency_hz;
  double frequency_step_hz; } praat_spectrogram_meta_v1;
int32_t praat_spectrogram_v1(const praat_audio_input_v1 *,
  double analysis_width_seconds, double max_frequency_hz,
  double min_time_step_seconds, double min_frequency_step_hz,
  int32_t window_shape, double *out_power, praat_spectrogram_meta_v1 *out_meta);
int32_t praat_pitch_raw_ac_v1(const praat_audio_input_v1 *,
  double time_step_seconds, double floor_hz, double ceiling_hz,
  int32_t max_candidates, int32_t very_accurate, double silence_threshold,
  double voicing_threshold, double octave_cost, double octave_jump_cost,
  double voiced_unvoiced_cost, double *out_hz, double *out_strength,
  int32_t out_frame_capacity, int32_t *out_frame_count);
```

`0` success; nonzero stable wrapper error; never C++ exception. Planar channels. Caller allocates after sizing/known capacity. Reject nonfinite args, counts `< 1`, nonpositive interval, capacity mismatch. No Praat pointers, `std::string`, allocations, callbacks, threads, filesystem, UI, AudioWorklet cross ABI. `window_shape` = pinned `Sound_and_Spectrogram_enums.h` values only, copied with notice after probe.

Future wrapper: headers/license notices for all included/adapted Praat files + path/pin per header. `src/dsp/praat/`; generated WASM untracked unless policy changes.

## Closure decision

Spectrogram closure: [manifest](praat-spectrogram-manifest.md). Pitch closure still needs `fon/Sound_to_Pitch.{cpp,h}`, `fon/Sound_and_Spectrum.h`, `fon/Pitch.h`, `num/NUM2.h`, FFT, sampled hierarchy, candidate/path data, peak interpolation, Melder containers/errors/thread macros. Full barren build = lower-complexity first proof; selective pitch closure premature.

## Evidence

Native pinned `praat_barren`, 2026-09-24:

```text
spectrogram frames=498 pitch frames=97 Hz(frame 10)=220.000158637989
```

Current exact WASM failure:

```text
blocked: Emscripten missing: need emcc and em++ on PATH
install durable Emscripten SDK through sanctioned sandbox installer; rerun ./scripts/praat-wasm-probe.sh
```
