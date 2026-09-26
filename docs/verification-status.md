# Harmonic Lens verification status

**Release-candidate audit:** 2026-09-26. This page separates deterministic
repository evidence from unrun manual/runtime checks.

| Area | Status | Verified scope | Not verified / boundary |
| --- | --- | --- | --- |
| Clean install/build | **VERIFIED in audit** | `npm ci`, tests, fixture hashes, staged-artifact hashes, TypeScript/Vite build. | Audit host Node 20.19.2 is below declared 22.12.0 engine; repeat clean-clone check on supported Node before release. Browser/Electron runtime not exercised. |
| Browser WASM artifacts | **VERIFIED staged** | Four tracked `.js`/`.wasm` files are checked against committed SHA-256 manifest before every build; Vite copies `public/` into `dist/`. | Rebuilding needs ignored pinned Praat checkout + Emscripten 3.1.69. Manifest changes require review. |
| Native Praat oracle | **VERIFIED reference** | Pinned `v7.0.02` / `6f3da9ef` fixture contract/hashes in [`native-oracle.json`](../tests/praat-golden/native-oracle.json). | Current host cannot regenerate native reference: checked-in binary needs GLIBC 2.38. |
| WASM spectrogram | **VERIFIED parity** | Prior fixture comparison: four exports, 498 frames × 116 bins; worst absolute power delta `7.105427357601002e-15`. | Audit did not rebuild/recompare ignored Emscripten output. |
| WASM pitch / HNR | **IMPLEMENTED, unverified audit parity** | Runtime Worker invokes raw-AC pitch and CC harmonicity ABI; deterministic wrapper scripts exist. | Audit did not rebuild or run comparators: ignored checkout/toolchain unavailable in clean clone. No live latency/quality claim. |
| Live integration | **IMPLEMENTED, unverified runtime** | Worker lifecycle/overload/unit behavior covered by `npm test`; fallback remains. | No manual microphone/browser/Electron test performed. Canvas image still uses browser FFT. |
| Electron security/lifecycle | **UNIT-VERIFIED policy** | Audio-only trusted-main-page permission policy; temporary profile cleanup path. | No packaged-app permission/quit test on desktop session. |
| Linux AppImage | **VERIFIED in audit** | `npm run package:linux` creates unsigned x64 AppImage. | Build host Node 20.19.2 is below declared 22.12.0 engine; install/launch/manual mic test not performed; desktop/portal behavior host-specific. |

## Commands

```sh
npm ci
npm test
npm run praat:fixtures:check
npm run praat:wasm:stage:check
npm run build
npm run package:linux
```

## Product boundary

Roadmap Milestone 4 formant/session features are **not implemented**. This
release candidate covers current microphone + harmonic-analysis application,
not full M4 product completion. No claim of manual microphone validation.

## Evidence

- [Native/WASM TSV contract](praat-golden.md)
- [WASM provenance and ABI](praat-wasm-probe.md)
- [Runtime design](realtime-wasm-integration.md)
