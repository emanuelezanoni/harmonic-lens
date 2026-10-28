import assert from "node:assert/strict";
import test from "node:test";
import { loadSettings, saveSettings } from "../src/saved-settings";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

test("saved settings round-trip", () => {
  const s = memory();
  saveSettings({ voiceType: "5000", range: "3000", mode: "0.03", showFormants: false }, s);
  assert.deepEqual(loadSettings(s), { voiceType: "5000", range: "3000", mode: "0.03", showFormants: false });
});

test("saved settings ignore garbage and wrong types", () => {
  const s = memory();
  s.setItem("harmonic-lens.settings.v1", "{not json");
  assert.deepEqual(loadSettings(s), {});
  s.setItem("harmonic-lens.settings.v1", JSON.stringify({ voiceType: 5, showFormants: "yes", range: "5000" }));
  assert.deepEqual(loadSettings(s), { voiceType: undefined, range: "5000", mode: undefined, showFormants: undefined });
});

test("storage failures never throw", () => {
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
  assert.deepEqual(loadSettings(broken), {});
  assert.doesNotThrow(() => saveSettings({ range: "5000" }, broken));
});
