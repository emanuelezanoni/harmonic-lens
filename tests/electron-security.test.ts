import assert from "node:assert/strict";
import test from "node:test";

const { allowsMicrophonePermission } = await import("../electron/security.mjs");
const main = 7;

test("Electron permission policy permits only microphone audio from trusted main page", () => {
  assert.equal(allowsMicrophonePermission({ permission: "media", pageUrl: "file:///app/index.html", requestWebContentsId: main, mainWebContentsId: main, mediaTypes: ["audio"] }), true);
  assert.equal(allowsMicrophonePermission({ permission: "media", pageUrl: "http://127.0.0.1:5173/", requestWebContentsId: main, mainWebContentsId: main, devServerUrl: "http://127.0.0.1:5173", mediaTypes: ["audio"] }), true);
});

test("Electron permission policy denies camera, mixed media, untrusted pages, and child contents", () => {
  const base = { permission: "media", pageUrl: "file:///app/index.html", requestWebContentsId: main, mainWebContentsId: main };
  assert.equal(allowsMicrophonePermission({ ...base, mediaTypes: ["video"] }), false);
  assert.equal(allowsMicrophonePermission({ ...base, mediaTypes: ["audio", "video"] }), false);
  assert.equal(allowsMicrophonePermission({ ...base, pageUrl: "https://attacker.invalid/", mediaTypes: ["audio"] }), false);
  assert.equal(allowsMicrophonePermission({ ...base, requestWebContentsId: 8, mediaTypes: ["audio"] }), false);
});
