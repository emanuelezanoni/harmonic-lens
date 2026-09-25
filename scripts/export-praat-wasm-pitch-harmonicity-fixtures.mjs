import { mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import manifest from '../tests/praat-golden/manifest.json' with { type: 'json' };
const output = 'analysis-output/praat-wasm-pitch-harmonicity';
await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
for (const fixture of manifest.fixtures) await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['scripts/export-praat-wasm-pitch-harmonicity.mjs', `tests/praat-golden/fixtures/${fixture.id}.wav`, `${output}/${fixture.id}`], { stdio: 'inherit' });
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${fixture.id}: exporter exit=${code}`)));
});
