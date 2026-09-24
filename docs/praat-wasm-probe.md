# Praat WebAssembly build probe

## Result

Status: partial success, 2026-09-24. `emcc`/`em++` 3.1.69 builds direct reachable spectrogram closure into Node `.js`/`.wasm`; deterministic 220 Hz Float32 PCM smoke test returns real `Sound_to_Spectrogram_e` output. Full `praat_barren` remains blocked by an Emscripten clang frontend crash compiling unrelated `dwtools/FilterBank.cpp` at `-O3`. First fresh probe stopped at missing `zconf.h`. Revised probe isolates a supplied zlib `zconf.h`, preserves Emscripten sysroot headers, then stages upstream external libraries before Praat libraries. Probe cleans ignored native build products first, so host `.o`/`.a` files cannot be mistaken for WebAssembly output. `PRAAT_AUDIO=none` omits Linux audio link flags but does not define `NO_AUDIO`; probe adds `-DNO_AUDIO` through compiler commands, preserving upstream subdirectory `CPPFLAGS`. No upstream source changed.

Pin: `praat/praat` `v7.0.02`, `6f3da9ef1d8cce0d5684afc104d02888dfc71b25`; ignored checkout `reference/praat/`. Target DSP: `fon/Sound_and_Spectrogram.cpp:Sound_to_Spectrogram_e`; `fon/Sound_to_Pitch.cpp:Sound_to_Pitch_rawAc` → `Sound_to_Pitch_any`.

## Minimal-complexity probe

Unmodified upstream + barren graphics + no audio + Emscripten compiler/linker substitution. Tests compile/link before closure extraction. No DSP change, UI, realtime claim.

```sh
./scripts/praat-wasm-probe.sh
```

It checks tools + exact clean pin, removes ignored build products, then:

```sh
make -C reference/praat clean
emmake make -C reference/praat \
  PRAAT_GRAPHICS=barren PRAAT_AUDIO=none PRAAT_COMPILER=clang \
  CC='emcc -DNO_AUDIO' CXX='em++ -DNO_AUDIO' LINKER_COMMAND='em++ -sENVIRONMENT=node' -j"$(nproc)"
node reference/praat/praat_barren.js --run scripts/praat-native-probe.praat
```

Requires readable zlib development `zconf.h` at `/usr/include/zconf.h` (observed
SHA-256: `44e543ff4514c7a9a01d648019c2c9a81d1105cbfa3c77f1faf6cd86eafa8abd`), or set
`PRAAT_ZCONF_HEADER=/absolute/path/to/zconf.h`. The script copies it into a
temporary include directory; do not pass `CPPFLAGS=-I/usr/include`, because it
shadows Emscripten sysroot libc headers. It runs `all-external`, `all-self`, then
`praat_barren` sequentially: upstream `all` parallelizes first two despite
undeclared archive/header ordering. This is build invocation adaptation only.

Success output shape: `spectrogram frames=... pitch frames=... Hz(frame 10)=...`. Proves upstream CLI Node-WASM only; not numeric parity, browser approval, wrapper validation. Save compiler version, command, `.js`/`.wasm` hashes, stdout under ignored `analysis-output/`.

Known risk: host-generated `zconf.h` needs target review before product use;
probe only establishes compile feasibility. No `PRAAT_COMPILER=emcc` branch.
Later Linux-native flags (`-no-pie`, pthread assumptions) remain untested.
Record full error. Do not patch upstream DSP.

## Direct spectrogram wrapper probe

`src/dsp/praat/praat_spectrogram_wrapper.cpp` is a new GPL-2.0-or-later C ABI
adapter; it calls unmodified pinned `fon/Sound.cpp` and
`fon/Sound_and_Spectrogram.cpp`. It accepts planar Float32 PCM, copies it to a
Praat `Sound`, calls `Sound_to_Spectrogram_e`, then returns time-major power and
grid metadata. It exports no Praat object, UI, filesystem, callback, or thread
ABI. Output is ignored, auditable build evidence only:

```sh
npm run praat:wasm:probe
```

This links only archives reachable from the wrapper (`fon`, `stat`, `dwsys`,
`sys`, `melder`, `kar`, `external/num`), after `praat-wasm-probe.sh` has built
them. It deliberately excludes `dwtools`; full build currently dies in its
unrelated `FilterBank.cpp` compiler crash. `scripts/praat-wasm-wrapper-test.mjs`
generates 44,100 samples of 220 Hz PCM, invokes exported
`praat_spectrogram_v1`, verifies valid grid/output capacity, and checks frame 10
peak lies within one returned bin of 220 Hz. Current artifact paths:
`analysis-output/praat-wasm-wrapper/praat-spectrogram.js` and `.wasm`.

## Wrapper ABI

Tracked C++ wrapper; batch-only C ABI. JS owns linear-memory allocation:

```c
typedef struct { const float *samples; int32_t channel_count; int32_t sample_count;
  double sample_interval_seconds; } praat_audio_input_v1;
typedef struct { int32_t frame_count; int32_t bin_count; double first_time_seconds;
  double time_step_seconds; double first_frequency_hz;
  double frequency_step_hz; } praat_spectrogram_meta_v1;
int32_t praat_spectrogram_v1(const praat_audio_input_v1 *,
  double analysis_width_seconds, double max_frequency_hz,
  double min_time_step_seconds, double min_frequency_step_hz,
  int32_t window_shape, double *out_power, int32_t out_power_capacity,
  praat_spectrogram_meta_v1 *out_meta);
int32_t praat_pitch_raw_ac_v1(const praat_audio_input_v1 *,
  double time_step_seconds, double floor_hz, double ceiling_hz,
  int32_t max_candidates, int32_t very_accurate, double silence_threshold,
  double voicing_threshold, double octave_cost, double octave_jump_cost,
  double voiced_unvoiced_cost, double *out_hz, double *out_strength,
  int32_t out_frame_capacity, int32_t *out_frame_count);
```

`0` success; nonzero stable wrapper error; never C++ exception. Planar channels. Call first with `out_power = NULL`, `out_power_capacity = 0`: status `3` plus required `out_meta.frame_count * bin_count`; allocate then call again. Reject nonfinite args, counts `< 1`, nonpositive interval, capacity mismatch. No Praat pointers, `std::string`, allocations, callbacks, threads, filesystem, UI, AudioWorklet cross ABI. `window_shape` = pinned `Sound_and_Spectrogram_enums.h` values only, copied with notice after probe.

Future wrapper: headers/license notices for all included/adapted Praat files + path/pin per header. `src/dsp/praat/`; generated WASM untracked unless policy changes.

## Closure decision

Spectrogram closure: [manifest](praat-spectrogram-manifest.md). Pitch closure still needs `fon/Sound_to_Pitch.{cpp,h}`, `fon/Sound_and_Spectrum.h`, `fon/Pitch.h`, `num/NUM2.h`, FFT, sampled hierarchy, candidate/path data, peak interpolation, Melder containers/errors/thread macros. Full barren build = lower-complexity first proof; selective pitch closure premature.

## Fresh WASM evidence

## Pitch linker/symbol evidence

2026-09-24; one narrow `em++` link probe. It compiled a stdin-only function
calling unmodified `Sound_to_Pitch_rawAc` (which calls `Sound_to_Pitch_any`),
with the existing wrapper archive order and `-sERROR_ON_UNDEFINED_SYMBOLS=1`.
No repo source, UI, package, or Praat source changed.

`fon/libfon.a:Sound_to_Pitch.o` is exact entry object. It defines:

```text
Sound_to_Pitch_rawAc(structSound*, double, double, double, long, bool, double, double, double, double, double)
Sound_to_Pitch_any(structSound*, int, double, double, double, double, long, double, double, double, double, double)
```

Direct required objects/symbols found in already-built archives:

```text
fon/libfon.a:Pitch.o                 Pitch_create, Pitch_Frame_init, Pitch_pathFinder
fon/libfon.a:Sound.o                 Sound_extractChannel
fon/libfon.a:Sound_and_Spectrum.o    Sound_to_Spectrum, Spectrum_to_Sound
fon/libfon.a:Sampled.o               Sampled_shortTermAnalysis
dwsys/libdwsys.a:NUMFourier.o        NUMfft_forward, NUMfft_backward, NUMFourierTable_create
sys/libsys.a:Thing.o                 _Thing_forget
melder/libmelder.a:MelderThread.o    MelderThread_run
melder/libmelder.a:NUMinterpol.o     NUMimproveMaximum, NUM_interpolate_sinc
melder/libmelder.a:NUMrandom.o       NUMrandom_getChannel, NUMrandom_setChannel
melder/libmelder.a:NUM.o             NUMmean
```

Required archive set for attempted closure: `fon/libfon.a`, `stat/libstat.a`,
`dwsys/libdwsys.a`, `sys/libsys.a`, `melder/libmelder.a`, `kar/libkar.a`,
`external/num/libnum.a`. Link did not reach a meaningful transitive closure:
all selected archive members, including `Sound_to_Pitch.o`, are x86-64 ELF.
First fatal unresolved symbol:

```text
wasm-ld-19: error: /tmp/emscripten_temp_.../-_0.o: undefined symbol: _Thing_forget(structThing*)
```

`wasm-ld-19` also reports `Sound_to_Pitch.o` and other members as `neither Wasm
object file nor LLVM bitcode`. Thus archive/symbol map identifies needed
unmodified Praat closure, but cannot expose it in current wrapper until the
same set is rebuilt for Emscripten. No pitch ABI implementation added.

Full CLI staging (`./scripts/praat-wasm-probe.sh`) built external archives and
`fon/libfon.a`, then stopped in unrelated `dwtools`:

```text
clang++-19: error: clang frontend command failed with exit code 139
... -O3 ... FilterBank.cpp -o FilterBank.o
make[1]: *** [<builtin>: FilterBank.o] Error 1
```

Direct wrapper (`npm run praat:wasm:probe`) produced ignored
`praat-spectrogram.js` (64,847 bytes) and `.wasm` (5,000,463 bytes), then:

```text
spectrogram frames=230 bins=464 peakHz=215.33203125 peakPower=53.7491368571116
```

Link warning remains: `wasm-ld-19: warning: function signature mismatch:
GRAPHICS_PostScript_settings` between `sys/libsys.a(HyperPage.o)` and
`sys/libsys.a(praat_picture.o)`. Smoke test passes; eliminate or scope warning
before product use. Build also emits existing `melder_int.h` wasm32
integer-range warnings.

## Earlier evidence

Native pinned `praat_barren`, 2026-09-24:

```text
spectrogram frames=498 pitch frames=97 Hz(frame 10)=220.000158637989
```

Fresh Emscripten probe, 2026-09-24 (`emcc`/`em++` 3.1.69; Node v20.19.2):

```text
em++ -DNO_AUDIO ... -c -o melder_audio.o melder_audio.cpp
... succeeds; Linux soundcard include is disabled.

In file included from MelderReadText.cpp:21:
./../external/zlib/zlib.h:38:11: fatal error: 'zconf.h' file not found
   38 | # include "zconf.h"
      |           ^~~~~~~~~
make[1]: *** [<builtin>: MelderReadText.o] Error 1
make: *** [Makefile:430: all-self] Error 2
```

`external/zlib/zlib.h` expects host-provided `zconf.h`; Emscripten sysroot has
none, and upstream checkout contains no `zconf.h`. Top-level `-j` builds
`all-external` and `all-self` concurrently, so `melder` also has no declared
dependency on `external/zlib`. Remaining parallel jobs were stopped after this
decisive failure. Build-system adaptation or a reviewed generated Emscripten
zlib config is required; do not patch upstream DSP. No `praat_barren.js` or
`praat_barren.wasm` exists, therefore no WASM success claim.
