import assert from "node:assert/strict";
import test from "node:test";

const { allowsMicrophoneCheck, allowsMicrophonePermission } = await import("../electron/security.mjs");
const main = 7;
const trustedFileUrl = "file:///app/dist/index.html";

test("Electron permission policy permits only microphone audio from trusted main page", () => {
  assert.equal(allowsMicrophonePermission({ permission: "media", pageUrl: trustedFileUrl, isMainFrame: true, requestWebContentsId: main, mainWebContentsId: main, trustedFileUrl, mediaTypes: ["audio"] }), true);
  assert.equal(allowsMicrophonePermission({ permission: "media", pageUrl: "http://127.0.0.1:5173/", isMainFrame: true, requestWebContentsId: main, mainWebContentsId: main, devServerUrl: "http://127.0.0.1:5173", mediaTypes: ["audio"] }), true);
});

test("Electron permission policy denies camera, mixed media, untrusted pages, and child contents", () => {
  const base = { permission: "media", pageUrl: trustedFileUrl, isMainFrame: true, requestWebContentsId: main, mainWebContentsId: main, trustedFileUrl };
  assert.equal(allowsMicrophonePermission({ ...base, mediaTypes: ["video"] }), false);
  assert.equal(allowsMicrophonePermission({ ...base, mediaTypes: ["audio", "video"] }), false);
  assert.equal(allowsMicrophonePermission({ ...base, pageUrl: "https://attacker.invalid/", mediaTypes: ["audio"] }), false);
  assert.equal(allowsMicrophonePermission({ ...base, requestWebContentsId: 8, mediaTypes: ["audio"] }), false);
  assert.equal(allowsMicrophonePermission({ ...base, pageUrl: "file:///tmp/attacker.html", mediaTypes: ["audio"] }), false);
  assert.equal(allowsMicrophonePermission({ ...base, requestingUrl: "file:///tmp/attacker.html", mediaTypes: ["audio"] }), false);
  assert.equal(allowsMicrophonePermission({ ...base, isMainFrame: false, mediaTypes: ["audio"] }), false);
});

test("Electron permission checks permit only audio from trusted main contents", () => {
  const base = { permission: "media", pageUrl: trustedFileUrl, isMainFrame: true, requestWebContentsId: main, mainWebContentsId: main, trustedFileUrl };
  assert.equal(allowsMicrophoneCheck({ ...base, mediaType: "audio" }), true);
  assert.equal(allowsMicrophoneCheck({ ...base, mediaType: "video" }), false);
  assert.equal(allowsMicrophoneCheck({ ...base, pageUrl: "file:///tmp/attacker.html", mediaType: "audio" }), false);
  assert.equal(allowsMicrophoneCheck({ ...base, permission: "geolocation", mediaType: undefined }), false);
});
