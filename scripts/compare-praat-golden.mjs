import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const take = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const referenceDir = resolve(take('--reference', 'analysis-output/praat-reference'));
const candidateDir = args.includes('--candidate') ? resolve(take('--candidate')) : null;
if (!candidateDir) throw new Error('usage: npm run praat:golden:compare -- --candidate <wrapper-output-dir> [--reference <native-dir>]');
const manifest = JSON.parse(readFileSync('tests/praat-golden/manifest.json', 'utf8'));
const analyses = [
  ['spectrogram.tsv', 4, manifest.tolerances.spectrogramPowerAbsolute],
  ['pitch.tsv', 2, manifest.tolerances.pitchHzAbsolute],
  ['harmonicity.tsv', 2, manifest.tolerances.harmonicityDbAbsolute]
];
const rows = (path) => readFileSync(path, 'utf8').trimEnd().split('\n').slice(1).map((line) => line.split('\t').map(Number));
let failures = 0;
for (const fixture of manifest.fixtures) for (const [file, valueColumn, tolerance] of analyses) {
  const expectedPath = `${referenceDir}/${fixture.id}/${file}`;
  const actualPath = `${candidateDir}/${fixture.id}/${file}`;
  if (!existsSync(expectedPath) || !existsSync(actualPath)) { console.error(`missing: ${!existsSync(expectedPath) ? expectedPath : actualPath}`); failures++; continue; }
  const expected = rows(expectedPath), actual = rows(actualPath);
  if (expected.length !== actual.length) { console.error(`${fixture.id}/${file}: row count ${actual.length}, need ${expected.length}`); failures++; continue; }
  let worst = 0;
  for (let i = 0; i < expected.length; i++) {
    for (let col = 0; col < expected[i].length; col++) if (col !== valueColumn && expected[i][col] !== actual[i][col]) { console.error(`${fixture.id}/${file}: metadata mismatch row ${i + 2}, column ${col + 1}`); failures++; break; }
    const delta = Math.abs(expected[i][valueColumn] - actual[i][valueColumn]);
    if (Number.isFinite(delta)) worst = Math.max(worst, delta);
    else if (!Object.is(expected[i][valueColumn], actual[i][valueColumn])) { console.error(`${fixture.id}/${file}: nonfinite mismatch row ${i + 2}`); failures++; }
  }
  if (worst > tolerance) { console.error(`${fixture.id}/${file}: max abs delta ${worst}, tolerance ${tolerance}`); failures++; }
  else console.log(`${fixture.id}/${file}: pass; max abs delta ${worst}`);
}
if (failures) process.exitCode = 1;
