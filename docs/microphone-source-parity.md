# Microphone capture source-parity review

Reviewed 2026-10-03 against pinned upstream source, not general Web Audio advice.

## Sources

- Electron `df79406cecfd393f38d5a18b83379d4ba85cc29b`: [`session.md`](https://github.com/electron/electron/blob/df79406cecfd393f38d5a18b83379d4ba85cc29b/docs/api/session.md), [`system-preferences.md`](https://github.com/electron/electron/blob/df79406cecfd393f38d5a18b83379d4ba85cc29b/docs/api/system-preferences.md), and [`MediaAccessPermissionRequest`](https://github.com/electron/electron/blob/df79406cecfd393f38d5a18b83379d4ba85cc29b/docs/api/structures/media-access-permission-request.md).
- Jitsi Meet Electron `e91ea0cbe57d56a6db46deccec4b1134ecfabaa1`: [`main.ts`](https://github.com/jitsi/jitsi-meet-electron/blob/e91ea0cbe57d56a6db46deccec4b1134ecfabaa1/main.ts), [`package.json`](https://github.com/jitsi/jitsi-meet-electron/blob/e91ea0cbe57d56a6db46deccec4b1134ecfabaa1/package.json), and [`entitlements.mac.plist`](https://github.com/jitsi/jitsi-meet-electron/blob/e91ea0cbe57d56a6db46deccec4b1134ecfabaa1/resources/entitlements.mac.plist). Its capture library is lib-jitsi-meet `7afa6544e90516ce68d06f5bd64af01779d8d02f`: [`RTCUtils.js`](https://github.com/jitsi/lib-jitsi-meet/blob/7afa6544e90516ce68d06f5bd64af01779d8d02f/modules/RTC/RTCUtils.js), [`RTCUtils.spec.ts`](https://github.com/jitsi/lib-jitsi-meet/blob/7afa6544e90516ce68d06f5bd64af01779d8d02f/modules/RTC/RTCUtils.spec.ts), and [`JitsiLocalTrack.ts`](https://github.com/jitsi/lib-jitsi-meet/blob/7afa6544e90516ce68d06f5bd64af01779d8d02f/modules/RTC/JitsiLocalTrack.ts).
- Mozilla MDN Web Dictaphone `39ce84b2049ce19264787b43d5d6b1adb313c95a`: [`scripts/app.js`](https://github.com/mdn/dom-examples/blob/39ce84b2049ce19264787b43d5d6b1adb313c95a/media/web-dictaphone/scripts/app.js), official minimal `getUserMedia` + Web Audio sample.

Packaging evidence: electron-builder [issue #9529](https://github.com/electron-userland/electron-builder/issues/9529) reports silent live tracks and missing TCC prompts for implicit/ad-hoc-signed macOS artifacts from 26.0.13 onward; the issue thread resolves it to hardened runtime without the `audio-input` entitlement: `identity: "-"` with `hardenedRuntime: false` works, and `identity: null` leaves an unsealed bundle that Apple Silicon will not launch. This repo locks 26.15.3 and uses ad-hoc + `hardenedRuntime: false`.

## Step comparison

| Step | Reference behavior | Harmonic Lens result |
| --- | --- | --- |
| Permission timing / TCC | Electron requires both permission handlers for complete control; macOS TCC uses `askForMediaAccess` plus `NSMicrophoneUsageDescription`. Jitsi broadly allows non-`openExternal` permissions. | Adopted Electron pattern, narrowed: handlers installed at ready; only trusted main contents, exact packaged page/dev origin, `media`, and audio pass. TCC request occurs only after Start-driven renderer request. Purpose string present. |
| Enumeration / change | Jitsi enumerates initially and after `devicechange`, deduplicates lists, polls when events unsupported. MDN sample has no device selection. | Initial + post-grant enumeration; generation guard prevents stale async results; `devicechange` refresh; labels backfilled after grant. Polling rejected: Chromium/Electron target supports event, and polling adds wakeups without concrete target gap. |
| Constraints / exact ID | Jitsi disables configurable audio processing and uses `{ exact: micDeviceId }`. MDN requests `{ audio: true }`. | Adopted exact ID and disabled echo cancellation, noise suppression, auto gain for measurement fidelity. Generic MDN constraint rejected: would let Chromium alter analysis signal. |
| Exact-ID failure | References surface capture errors; neither reviewed implementation safely falls back from a vanished selected input. | Local reliability behavior retained: only `NotFoundError`/`OverconstrainedError` with explicit selection retries once on default. Permission/read failures never retry. Regression tests cover both branches. |
| AudioContext / stream lifecycle | MDN lazily creates one context but does not stop tracks or close context. Jitsi disposes local streams/tracks; its optional gUM timeout avoids a permanently pending request. | Context created/resumed in click activation, graph built only after capture, track `ended` + context state changes stop session, generation guards discard late starts, and stop disconnects nodes, stops every track, closes context/backend. Global timeout rejected: native TCC is user-paced; arbitrary expiry can turn a valid slow consent into failure. |
| Errors | Jitsi preserves named gUM error/constraint telemetry. MDN logs one generic string. | Named actionable UI for permission, missing/overconstrained, busy, aborted, security, inactive-document, and unknown failures. No remote telemetry: app is local-only. |
| macOS arm64 packaging | Jitsi emits universal signed artifacts, purpose strings, and signing entitlements. Electron says purpose string is mandatory. | Native arm64 ZIP default; x64/universal optional. No native Node modules. Non-sandboxed unsigned build needs no audio-input entitlement. Adopted ad-hoc `identity: "-"` with `hardenedRuntime: false` (see #9529 resolution). Developer ID signing/notarization remains release work. |

## Adopted / rejected summary

Adopted: Electron dual permission gates, explicit TCC request, plist purpose text; Jitsi exact device constraints, post-grant enumeration, device-change refresh, complete stream disposal; explicit truly-unsigned mac identity for current test artifacts. Local fallback improves on references and stays narrowly error-gated.

Rejected: Jitsi allow-by-default permission policy (too broad), universal-only distribution (larger than required), custom signing entitlements for current unsigned non-sandboxed build, device polling (no Chromium gap), gUM timeout (TCC prompt has no safe universal deadline), MDN's generic constraints and incomplete cleanup.

## Physical boundary

Unit/build/static package checks cannot prove CoreAudio samples, TCC prompt behavior, unplug/sleep recovery, signing identity stability, or silence-vs-live-track failure. Run [`macos-arm64.md`](macos-arm64.md) on physical Apple Silicon for unsigned test artifact, then repeat for separately signed/notarized release artifact.
