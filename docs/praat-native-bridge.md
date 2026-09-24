# Native Praat offline bridge — investigation

## Scope

Native reference oracle only. No realtime bridge, Praat DSP rewrite, source import, or WASM port exists here.

WASM compile investigation: [Praat WebAssembly build probe](praat-wasm-probe.md). Current status tool-blocked; native result below is not WASM evidence.

Harmonic Lens needs these pinned-Praat operations:

| UI need | Praat command | C++ entry point | Upstream source |
| --- | --- | --- | --- |
| Spectrogram power matrix | `To Spectrogram: windowLength, maximumFrequency, timeStep, frequencyStep, windowShape` | `Sound_to_Spectrogram_e` | `fon/Sound_and_Spectrogram.cpp` |
| F0 candidates/path | `To Pitch (raw autocorrelation): timeStep, pitchFloor, pitchCeiling, maxnCandidates, veryAccurate, silenceThreshold, voicingThreshold, octaveCost, octaveJumpCost, voicedUnvoicedCost` | `Sound_to_Pitch_rawAc` → `Sound_to_Pitch_any` | `fon/Sound_to_Pitch.cpp` |

`src/main.ts` current live F0 range is 70–400 Hz; probe uses 75–600 Hz because upstream `test/fon/Sound_to_Pitch.praat` uses that reference range. Select final native oracle parameters from product contract before parity fixtures.

## Pin, checkout, recovery

| Field | Value |
| --- | --- |
| Upstream | `https://github.com/praat/praat.git` |
| Release | `v7.0.02` |
| Commit | `6f3da9ef1d8cce0d5684afc104d02888dfc71b25` |
| Local ignored checkout | `reference/praat/` |
| Recovery | `mv reference/praat reference/praat.corrupt-YYYYMMDD` then `git clone --branch v7.0.02 --depth 1 https://github.com/praat/praat.git reference/praat` |

Verify detached pin; do not follow branch:

```sh
git -C reference/praat rev-parse HEAD
git -C reference/praat status --short --branch
```

Expected SHA: `6f3da9ef1d8cce0d5684afc104d02888dfc71b25`; status: detached `HEAD`, clean.

## Linux native oracle

`praat_barren` supports offline scripted analysis: no GUI/graphics/audio runtime needed. Build from pinned checkout:

```sh
cd reference/praat
make PRAAT_GRAPHICS=barren PRAAT_AUDIO=none PRAAT_COMPILER=gcc -j"$(nproc)"
./praat_barren --run ../../scripts/praat-native-probe.praat
```

Minimum observed build tools: `make`, `rsync`, `pkg-config`, `gcc`, `g++`. Barren + audio-none path omits GTK, ALSA, PulseAudio, Jack link deps. Full desktop Praat needs upstream Linux deps: `libgtk-3-dev`, `libasound2-dev`, `libpulse-dev`, `libjack-dev`.

Probe creates deterministic 220 Hz mono Sound in memory, calls `To Spectrogram` + raw-AC `To Pitch`, prints frame counts and F0. No microphone, browser, network, fixture, or tracked Praat source. Success exit proves native/offline invocation only; output values are not parity baselines.

## Provenance/license

This repo tracks no Praat code. Checkout and probe target GPL-2.0-or-later upstream sources, specifically `fon/Sound_and_Spectrogram.cpp`, `fon/Sound_to_Pitch.cpp`, and `fon/Sound_to_Pitch.h` at pin above. Any future copied/adapted source must retain upstream notices, path, commit, GPL obligations, plus parity fixtures before use. See [spectrogram manifest](praat-spectrogram-manifest.md).

## Current environment result

At investigation time: no `praat` executable on `PATH`; `gtk+-3.0`, `alsa`, and `jack` unavailable through `pkg-config`. Barren build succeeded with GCC, then probe succeeded:

```
spectrogram frames=498 pitch frames=97 Hz(frame 10)=220.000158637989
```

Full desktop build remains untested; it needs listed desktop/audio deps. Record fixture-backed outputs and tolerances before claiming numeric parity.
