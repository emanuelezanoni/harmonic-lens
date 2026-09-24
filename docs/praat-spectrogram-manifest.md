# Praat spectrogram provenance and dependency manifest

## Reference checkout

| Field | Value |
| --- | --- |
| Upstream | `https://github.com/praat/praat.git` |
| Release | `v7.0.02` |
| Commit | `6f3da9ef1d8cce0d5684afc104d02888dfc71b25` |
| Local path | `reference/praat/` (ignored; detached `HEAD`) |
| Refresh | `git -C reference/praat fetch --tags origin` then explicitly select and record a new commit; never follow a branch implicitly. |
| License | GPL-2.0-or-later for target/header and listed Praat dependencies. Preserve each copied/adapted file's notices. |

No Praat source is tracked or imported by this milestone.

## Target and port boundary

- Target: [`fon/Sound_and_Spectrogram.cpp`](https://github.com/praat/praat/blob/6f3da9ef1d8cce0d5684afc104d02888dfc71b25/fon/Sound_and_Spectrogram.cpp), function `Sound_to_Spectrogram_e`.
- Keep: time/frame grid calculation, six window equations, zero-padding rule, real FFT, per-channel power averaging, frequency-bin aggregation, normalization.
- Exclude: `Spectrogram_to_Sound`, `Graphics`, UI/progress display, Praat object system, generated enum text/value plumbing, thread macros. Browser worker/main-thread scheduling replaces `MelderThread_PARALLEL`.
- Input contract: planar `Float32Array`/`Float64Array` channels, sample interval `dx`; output: time-major power matrix plus `t1`, `timeStep`, `f1`, `freqStep` metadata. Preserve upstream one-based formulas while translating indices deliberately.

## Minimal dependency map

| Need | Upstream path/symbol | Port disposition |
| --- | --- | --- |
| Entry API + window enum | `fon/Sound_and_Spectrogram.h`; `fon/Sound_and_Spectrogram_enums.h` | Copy enum values/labels only if API needs them. |
| Sound samples/timing | `fon/Sound.h` → `Vector.h` → `Matrix.h` → `SampledXY.h` → `Sampled.h`; fields `z`, `ny`, `nx`, `dx`, `x1`, `xmin`, `xmax` | Replace Praat hierarchy with plain typed input/metadata. Only `Sampled_indexToX` and `Sampled_xToLowIndex` formulas needed. |
| Output matrix | `fon/Spectrogram.h`; `Spectrogram_create` | Replace with typed allocation + metadata; no drawing/conversion methods. |
| FFT + numeric helpers | `num/NUM2.h`; `num/NUMfft.*`; `NUMFourierTable_create`, `NUMfft_forward`, `NUMsum`, `NUMpi` | Use existing original browser FFT only after bin-layout/scaling parity test; otherwise port minimal real-FFT behavior with provenance headers. |
| Numeric/container/runtime | `melder` types/macros: `integer`, `longdouble`, `VEC`, `zero_VEC`, `Melder_ifloor`, `Melder_iround`, `Melder_throw`, `Melder_assert` | Replace with JS/TS numbers, typed arrays, explicit validation/errors. Confirm floor/round edge behavior in tests. |
| Parallelism/progress | `melder/MelderThread.h`, `MelderProgress` | Not ported. Processing must not run in `AudioWorkletProcessor`; use worker/batched main-thread work. |
| Generated enum support | `enums_getText.h`, `enums_getValue.h` | Not algorithm dependency; omit unless UI exposes Praat-compatible enum parsing/formatting. |

`Sound_to_Spectrogram_e` direct includes are `Sound_and_Spectrogram.h`, `NUM2.h`, `enums_getText.h`, `Sound_and_Spectrogram_enums.h`, and `enums_getValue.h`. Table separates direct compilation includes from algorithm requirements; it is intentionally not full Praat transitive closure.

## Required parity checks before source import

1. Use pinned `test/fon/Sound_to_Spectrogram.praat` plus consented fixtures kept outside Git.
2. Capture pinned-Praat output: frame count/times, bin count/frequencies, power values for mono and duplicate-channel stereo.
3. Compare browser output for every window shape, non-power-of-two window length, `fmax` clipping, and multi-bin aggregation. Define tolerances in test fixture metadata before implementation.
4. Each derived file goes in `src/dsp/praat/`, retains GPL/copyright text, and names this source path + commit in its header.
