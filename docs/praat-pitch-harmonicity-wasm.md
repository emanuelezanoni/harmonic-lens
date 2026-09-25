# Praat pitch/HNR WASM

`src/dsp/praat/praat_pitch_harmonicity_wrapper.cpp` is GPL-2.0-or-later glue,
calling unmodified Praat v7.0.02 commit
`6f3da9ef1d8cce0d5684afc104d02888dfc71b25`: `Sound_to_Pitch_rawAc` and
`Sound_to_Harmonicity_cc`. `scripts/praat-wasm-pitch-harmonicity.sh` links only
the pinned Emscripten archives and emits JS/WASM; it never accepts host ELF.

ABI: planar Float32 input, `praat_pitch_raw_ac_v1` / `praat_harmonicity_cc_v1`,
Float64 result track, `praat_track_meta_v1`; status `0..5` follows existing
spectrogram ABI. JS exporter uses fixture-contract params and emits golden TSV.

Pitch comparison remains `0.001 Hz`. CC HNR uses `0.01 dB`: pinned native and
Emscripten runs differ by at most `0.0051510992886818485 dB` on current golden
fixtures, so this is tolerance parity, not bitwise/numerical identity.
