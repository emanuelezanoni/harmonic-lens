# macOS Apple Silicon verification

CI builds one universal (arm64 + x64) ZIP, and an arm64-only ZIP remains available locally. Linux can validate source,
tests, renderer build, electron-builder configuration, and cross-package an
unsigned arm64 app directory for static Mach-O/plist/ASAR inspection. Linux cannot
execute that app, exercise CoreAudio/TCC, sign, notarize, or prove microphone
behavior.

## Build and static inspection on Apple Silicon

```sh
npm ci --include=dev
npm test
npm run build
npm run package:mac
ditto -x -k release/harmonic-lens-*-mac-arm64.zip /tmp/harmonic-lens-arm64
file "/tmp/harmonic-lens-arm64/Harmonic Lens.app/Contents/MacOS/Harmonic Lens"
plutil -p "/tmp/harmonic-lens-arm64/Harmonic Lens.app/Contents/Info.plist" | grep NSMicrophoneUsageDescription
codesign -d --entitlements :- "/tmp/harmonic-lens-arm64/Harmonic Lens.app" 2>&1
```

Expected executable architecture: `arm64`. Expected plist: non-empty microphone
purpose string. Absence of a custom microphone entitlement is intentional for
this non-sandboxed, non-Mac-App-Store build. `build.mac.identity` is `"-"`
(ad-hoc) with `hardenedRuntime: false`. `null` skips signing and leaves an unsealed bundle that Apple Silicon
will not launch; the 26.0.13+ microphone regression (electron-builder #9529) comes from hardened runtime
taking effect on an ad-hoc signature, which `hardenedRuntime: false` avoids. First launch of a downloaded copy
needs right-click Open or `xattr -dr com.apple.quarantine`. Replace the ad-hoc identity with Developer ID
signing plus notarization for a trusted release.

## Required physical-Mac runtime checks

1. Reset test state: `tccutil reset Microphone org.harmoniclens.app`.
2. Launch packaged app. Click **Start microphone**. Confirm one native macOS
   prompt, correct purpose text, and app entry under Privacy & Security.
3. Allow. Confirm status reaches Listening, input labels populate, live level and
   spectrogram move, audio is not audible, actual sample rate/channel diagnostics
   are credible for built-in and USB microphones.
4. Stop/start repeatedly. Switch default/explicit inputs. Unplug explicit USB
   input before start and during capture; confirm safe default fallback or clear
   disconnected status without hang/crash.
5. Deny after reset. Confirm start fails with System Settings remediation. Enable
   Harmonic Lens there, fully quit/reopen, then confirm capture works.
6. Sleep/wake and change system input/sample rate in Audio MIDI Setup. Confirm
   interruption ends cleanly and manual restart recovers.
7. Repeat against signed/notarized release artifact. Confirm `codesign --verify
   --deep --strict --verbose=2 <app>` and `spctl --assess --type execute
   --verbose=2 <app>` pass before distribution.

Universal build remains optional: run `npm run package:mac:universal`, then verify
`lipo -archs <app executable>` reports `x86_64 arm64`. Native arm64 is release
default: smaller artifact, direct CI execution, no Intel slice currently required.
