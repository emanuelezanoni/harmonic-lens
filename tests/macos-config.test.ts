import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const workflow = await readFile(new URL("../.github/workflows/desktop-release.yml", import.meta.url), "utf8");

test("macOS packaging declares microphone purpose and explicit architectures", () => {
  assert.match(packageJson.build.mac.extendInfo.NSMicrophoneUsageDescription, /microphone/i);
  assert.match(packageJson.scripts["package:mac"], /--arm64(?:\s|$)/);
  assert.match(packageJson.scripts["package:mac:x64"], /--x64(?:\s|$)/);
  assert.match(packageJson.scripts["package:mac:universal"], /--universal(?:\s|$)/);
  assert.deepEqual(packageJson.build.mac.target, ["zip"]);
  assert.equal(packageJson.build.mac.identity, null, "unsigned artifacts must not receive implicit ad-hoc signing");
});

test("release workflow builds macOS artifact natively on Apple Silicon", () => {
  assert.match(workflow, /os: macos-15\n\s+command: npm run package:mac/);
  assert.match(workflow, /artifact: harmonic-lens-\*-mac-arm64\.zip/);
});
