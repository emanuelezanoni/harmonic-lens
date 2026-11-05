import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { help } from "../src/ui/help";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const used = [...html.matchAll(/data-help="([^"]+)"/g)].map((m) => m[1]);

test("every ? button in the page has a help text", () => {
  assert.ok(used.length >= 14, `only ${used.length} help buttons`);
  for (const key of used) assert.ok(help[key], `missing help entry for "${key}"`);
});

test("every help text is used by a button", () => {
  for (const key of Object.keys(help)) assert.ok(used.includes(key), `unused help entry "${key}"`);
});

test("help entries are complete and titles are unique", () => {
  const titles = new Set<string>();
  for (const [key, e] of Object.entries(help)) {
    assert.ok(e.title.trim().length > 2 && e.body.length > 0 && e.body.every((t) => t.trim().length > 20), key);
    assert.ok(!titles.has(e.title), `duplicate title ${e.title}`);
    titles.add(e.title);
  }
});

test("the page has exactly one help popover and it is a native popover", () => {
  assert.equal((html.match(/id="helpPopover"/g) ?? []).length, 1);
  assert.match(html, /id="helpPopover"[^>]*popover="auto"/);
});
