# Harmonic Lens verification status

**Consolidated:** 2026-09-25 05:00 CEST. This is the single status surface
for the native/WASM analysis boundary; detailed commands and evidence remain
in the linked documents.

| Area | Status | What is verified | Boundary still not crossed |
| --- | --- | --- | --- |
| Native Praat oracle | **VERIFIED reference** | The pinned Praat `v7.0.02` / `6f3da9ef` contract, deterministic fixtures, and expected TSV file hashes/row counts are recorded in [`native-oracle.json`](../tests/praat-golden/native-oracle.json). It covers spectrogram, pitch, and CC harmonicity (HNR). | This host cannot regenerate the reference: its checked-in native binary needs GLIBC 2.38. Treat the JSON as the canonical native reference, not fresh local execution evidence. |
| Praat WASM spectrogram | **VERIFIED operational** | The narrow, unmodified-Praat spectrogram wrapper builds and passes its deterministic 220 Hz Node/WASM smoke test; the golden TSV exporter is available. | **Numerical parity is unverified.** The locally available native spectrogram TSV is incomplete, so the comparator correctly refuses a verdict. A complete pinned-native export is required before calling this equivalent. |
| Praat WASM pitch / HNR | **UNVERIFIED / blocked** | The required raw-AC pitch and CC-harmonicity entry points and their dependency closure have been mapped. | The selected Praat archives are host x86-64 ELF, not Emscripten objects. Rebuild the exact closure for Emscripten before adding a pitch or HNR ABI, smoke test, or parity claim. HNR depends on pitch; there is no substitute kernel. |
| Realtime integration | **UNVERIFIED / not integrated** | `AnalysisWindowBuffer`, the async `SpectrogramBackend` seam, and renderer-facing `AnalysisResult` contract exist. The live application still uses its browser FFT fallback. | No WASM artifact is loaded or called from the audio/UI/worker path. Keep the fallback active until spectrogram parity, metadata/layout checks, and an overload policy are accepted. |

## Night review (00:00-05:00 CEST)

- `312b82c`: added WASM spectrogram TSV export and comparator scoping.
- `d40393a`: added the realtime spectrogram backend seam.
- `cc80d2f`: added the renderer analysis-result contract.
- `ec71b30`, `f26f756`: recorded the pitch and harmonicity linker gates.

## Clean-clone check

At commit `cc80d2f78acfe2bcd9f9e87e09b0523d18604989`, a fresh sandbox clone
passed `npm ci`, `npm run build`, and `npm run praat:fixtures:check` on
2026-09-25. `npm ci` emitted existing Node 20 versus `>=22.12.0`
engine warnings from Electron rebuild dependencies; build and fixture hashes
still passed. No package or upstream Praat action was run.

## Next gate

Produce a complete native spectrogram export with a pinned `praat_barren`
binary compatible with the host, then run the existing spectrogram comparator.
Do not advance pitch, HNR, or realtime WASM integration on the basis of the
current smoke test.

## Evidence

- Native contract and comparator: [`praat-golden.md`](praat-golden.md)
- WASM probe and ABI gates: [`praat-wasm-probe.md`](praat-wasm-probe.md)
- Realtime seam: [`realtime-wasm-integration.md`](realtime-wasm-integration.md)
