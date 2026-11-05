# Harmonic Lens verification status

**Release-candidate audit:** 2026-09-26. This page separates deterministic
repository evidence from unrun manual/runtime checks.

| Area | Status | Verified scope | Not verified / boundary |
| --- | --- | --- | --- |
| Clean install/build | **VERIFIED in clean-clone audit** | Node 24.16.0: `npm ci --include=dev`, 7 tests, fixture hashes, staged-artifact hashes, TypeScript/Vite build. | Browser/Electron runtime not exercised. |
| Browser WASM artifacts | **VERIFIED staged** | Four tracked `.js`/`.wasm` files are checked against committed SHA-256 manifest before every build; Vite copies `public/` into `dist/`. | Rebuilding needs ignored pinned Praat checkout + Emscripten 3.1.69. Manifest changes require review. |
| Native Praat oracle | **VERIFIED reference** | Pinned `v7.0.02` / `6f3da9ef` fixture contract/hashes in [`native-oracle.json`](../tests/praat-golden/native-oracle.json). | Current host cannot regenerate native reference: checked-in binary needs GLIBC 2.38. |
| WASM spectrogram | **VERIFIED parity** | Fresh wrapper smoke build plus four fixture exports passed; 498 frames × 116 bins; worst absolute power delta `7.105427357601002e-15`. | No browser realtime latency/quality claim. |
| WASM pitch / HNR | **VERIFIED parity** | Fresh wrapper smoke build and four-fixture raw-AC/CC comparison passed. Worst pitch delta `6.026492513910853e-7`; HNR `0.0051510992886818485`. | No live latency/quality claim. Upstream/wasm-ld emits nonfatal compile/link warnings; investigate before changing closure/toolchain. |
| Live integration | **VERIFIED in CI and locally with a fake microphone** | One analysis engine in a worker (F0/HNR from Praat WASM, TypeScript Burg formants, tracker, spectrum). `npm test` plus headless Chromium and real Electron runs with Hillenbrand vowels and recorded voice as the microphone. | No physical microphone, CoreAudio or WASAPI run by the author; no hidden fallback estimator. |
| Electron security/lifecycle | **UNIT-VERIFIED policy, packaged app run on Linux** | Audio-only trusted-main-page permission policy; only the cache is temporary, preferences persist (checked by `check_electron_persistence.py`). Real Electron started from the source tree and from `app.asar`, with production permission handlers. | Packaged-app quit and permission flows on macOS and Windows not run. |
| macOS (universal) | **CI-BUILT; native runtime pending** | Universal ZIP on an Apple Silicon runner, ad-hoc signature with hardened runtime off, microphone purpose string, Electron permission + TCC flow, architecture/config regression tests. | Linux and CI cannot execute the app, exercise CoreAudio/TCC or validate notarization. Run [`macos-arm64.md`](macos-arm64.md) on a physical Mac. |
| Linux AppImage | **BUILT and SMOKE-TESTED in CI** | `npm run package:linux`; CI launches the real Electron app under Xvfb with a fake microphone and requires F0 and formants without page errors. | Manual run with a physical microphone not performed; desktop/portal behavior is host-specific. |

## Commands

```sh
npm ci --include=dev
npm test
npm run praat:fixtures:check
npm run praat:wasm:stage:check
npm run build
npm run package:linux
```

macOS architecture/TCC checklist: [`macos-arm64.md`](macos-arm64.md).

## Product boundary

Roadmap Milestone 4 formant/session features are **not implemented**. This
release candidate covers current microphone + harmonic-analysis application,
not full M4 product completion. No claim of manual microphone validation.

## Evidence

- [Native/WASM TSV contract](praat-golden.md)
- [WASM provenance and ABI](praat-wasm-probe.md)
- [Runtime design](realtime-wasm-integration.md)
