import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const main = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");

test("the window is sandboxed and cannot open or navigate to anything else", () => {
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: "deny" \}\)\)/);
  assert.match(main, /on\("will-navigate"/);
});

test("no stock menu bar outside macOS, and no white flash on start", () => {
  assert.match(main, /Menu\.setApplicationMenu\(process\.platform === "darwin"/);
  assert.match(main, /show:\s*false/);
  assert.match(main, /once\("ready-to-show"/);
});

test("only the cache is temporary, so preferences survive restarts", () => {
  assert.doesNotMatch(main, /setPath\("userData"/);
  assert.doesNotMatch(main, /setPath\("sessionData"/);
  assert.match(main, /setPath\("cache"/);
});
