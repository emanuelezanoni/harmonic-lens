// Record content-addressed metadata for a pinned native Praat golden export.
// Usage: node scripts/record-praat-golden-reference.mjs <export-dir> <metadata-file>
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const [exportDirectory, metadataFile] = process.argv.slice(2);
if (!exportDirectory || !metadataFile) {
  throw new Error('usage: node scripts/record-praat-golden-reference.mjs <export-dir> <metadata-file>');
}

const root = process.cwd();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifestPath = join(root, 'tests/praat-golden/manifest.json');
const exporterPath = join(root, 'scripts/praat-golden-export.praat');
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes);
const fixtureIds = manifest.fixtures.map(({ id }) => id).sort();
const fileNames = ['spectrogram.tsv', 'pitch.tsv', 'harmonicity.tsv'];
const files = {};

for (const id of fixtureIds) {
  files[id] = {};
  for (const name of fileNames) {
    const path = join(exportDirectory, id, name);
    const bytes = await readFile(path);
    const info = await stat(path);
    const rows = bytes.toString('utf8').split('\n').length - 2;
    if (rows < 0 || info.size === 0) throw new Error(`invalid oracle output: ${path}`);
    files[id][name] = { bytes: info.size, rows, sha256: hash(bytes) };
  }
}

const outputIds = (await readdir(exportDirectory)).sort();
if (JSON.stringify(outputIds) !== JSON.stringify(fixtureIds)) {
  throw new Error(`fixture directories differ: ${outputIds.join(', ')}`);
}

const metadata = {
  schemaVersion: 1,
  kind: 'Praat native oracle output metadata',
  praat: { version: 'v7.0.02', commit: manifest.analysis.praatCommit },
  source: {
    fixtureManifest: { path: basename(manifestPath), sha256: hash(manifestBytes) },
    exporter: { path: 'scripts/praat-golden-export.praat', sha256: hash(await readFile(exporterPath)) },
  },
  wasmSpectrogramV1: {
    input: 'planar Float32 PCM; channel-major; sample_interval_seconds = 1 / 44100',
    analysisWidthSeconds: manifest.analysis.spectrogram.windowLengthSeconds,
    maxFrequencyHz: manifest.analysis.spectrogram.maximumFrequencyHz,
    minTimeStepSeconds: manifest.analysis.spectrogram.timeStepSeconds,
    minFrequencyStepHz: manifest.analysis.spectrogram.frequencyStepHz,
    windowShape: 4,
    windowShapeLabel: manifest.analysis.spectrogram.windowShape,
  },
  reproduce: 'PRAAT_GOLDEN_REFERENCE_DIR=analysis-output/praat-reference npm run praat:golden:native',
  files,
};
await writeFile(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`);
