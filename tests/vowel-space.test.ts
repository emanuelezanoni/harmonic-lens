import assert from "node:assert/strict";
import test from "node:test";
import { nearestVowel, voiceScale, vowelPosition, vowelTargets } from "../src/ui/vowel-space";

test("chart orientation: /i/ top-left, /u/ top-right, /a/ bottom-centre", () => {
  const [i, u, a] = [vowelTargets[0], vowelTargets[6], vowelTargets[3]].map((t) => vowelPosition(t.f1, t.f2));
  assert.ok(i.x < u.x && i.y < a.y && u.y < a.y);
  assert.ok(a.x > i.x && a.x < u.x);
});

test("positions stay inside the unit square, even for out-of-range formants", () => {
  for (const [f1, f2] of [[50, 100], [2000, 5000], [500, 1500]]) {
    const p = vowelPosition(f1, f2);
    assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
  }
});

test("each target maps to itself, also after voice scaling", () => {
  for (const s of [1, voiceScale(5500), voiceScale(7000)]) for (const t of vowelTargets) {
    const n = nearestVowel(t.f1 * s, t.f2 * s, s);
    assert.equal(n.symbol, t.symbol); assert.ok(n.distance < 1e-9);
  }
});

test("a real male voice (G3 round) lands on the intended Italian vowels, except /u/ which sits between u and o", () => {
  const sol: Record<string, [number, number]> = { a: [683, 1272], "è": [542, 1636], "é": [393, 1736], i: [325, 2320], "ò": [560, 1057], "ó": [427, 935], u: [371, 966] };
  const expected: Record<string, string> = { a: "a", "è": "ɛ", "é": "e", i: "i", "ò": "ɔ", "ó": "o" };
  for (const [k, want] of Object.entries(expected)) assert.equal(nearestVowel(...sol[k]).symbol, want, k);
  assert.ok(["u", "o"].includes(nearestVowel(...sol.u).symbol));
});
