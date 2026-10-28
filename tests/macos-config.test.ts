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
  // identity: null makes electron-builder skip signing entirely; the edited Electron bundle (Info.plist,
  // renamed helpers) then has an invalid signature and Apple Silicon refuses to launch it. "-" = ad-hoc.
  assert.equal(packageJson.build.mac.identity, "-", "macOS bundle must at least be ad-hoc signed");
  assert.equal(packageJson.build.mac.hardenedRuntime, false, "ad-hoc + hardened runtime needs library-validation entitlements");
});

test("release workflow builds one universal macOS artifact on Apple Silicon", () => {
  assert.match(workflow, /os: macos-15\n\s+command: npm run package:mac:universal/);
  assert.match(workflow, /artifact: harmonic-lens-\*-mac-universal\.zip/);
});

test("release workflow smoke-tests the Linux app with a fake microphone", () => {
  assert.match(workflow, /run_electron\.py/);
});
