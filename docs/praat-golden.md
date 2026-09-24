# Praat equivalence golden foundation

## Scope

Repository-owned deterministic WAV fixtures, fixed analysis contract, native
Praat exporter, and TSV comparator. This is parity infrastructure; no
Praat-derived DSP or WASM wrapper exists yet.

Fixtures are generated from formulae in
[`tests/praat-golden/manifest.json`](../tests/praat-golden/manifest.json), then
tracked with SHA-256. They contain no speech, recordings, or third-party audio.
All are 44.1 kHz, one second, signed 16-bit PCM WAV: 220 Hz mono sine, 110 Hz
harmonic stack, duplicate-channel 220 Hz sine, and silence. Duplicate stereo
checks channel averaging; silence checks unvoiced/nonfinite handling.

## Contract

Pin: Praat `v7.0.02`, commit
`6f3da9ef1d8cce0d5684afc104d02888dfc71b25`.

Settings live only in manifest: spectrogram uses 5 ms Hanning
(sine-squared) window, 5 kHz ceiling, 2 ms time step, 20 Hz frequency step;
pitch uses raw autocorrelation, 10 ms step, 75–600 Hz; harmonicity uses CC,
10 ms step, 75 Hz minimum pitch, 0.1 silence threshold, one period/window.
Exact fields and tolerances also live there. Tolerances provisional until
first wrapper output; tighten only after numerical/precision review.

Native exporter writes, per fixture:

```text
<output>/<fixture>/spectrogram.tsv  frame time_seconds bin frequency_hz power
<output>/<fixture>/pitch.tsv        frame time_seconds hz
<output>/<fixture>/harmonicity.tsv  frame time_seconds db
```

Future wrapper must emit same TSV bytes for grid/index fields. Values compare
by manifest absolute tolerance. `NaN` must match `NaN`; no null/empty rewrite.
Pitch strength is not exported: proposed WASM ABI has it, but native script
contract has not pinned a corresponding winning-candidate strength query.

## Run

```sh
npm run praat:fixtures:check
cd reference/praat
make PRAAT_GRAPHICS=barren PRAAT_AUDIO=none PRAAT_COMPILER=gcc -j"$(nproc)"
cd ../..
npm run praat:golden:native
npm run praat:golden:compare -- --candidate analysis-output/praat-wasm
```

`analysis-output/` stays ignored. Native runner rejects missing/dirty/wrong-pin
checkout. It never downloads inputs. Regenerate intentional fixture changes:

```sh
npm run praat:fixtures
sha256sum tests/praat-golden/fixtures/*.wav
```

Then update manifest hashes/formula only after review.

## Current gaps

No `praat_barren` artifact existed when this foundation was added; native
export end-to-end result not yet recorded. No Emscripten-successful build, no
WASM wrapper, no wrapper exporter, no wrapper values, no final tolerances, and
no pitch-strength parity. These scripts define reproducible inputs and output
ABI now; they do not claim numeric equivalence.
