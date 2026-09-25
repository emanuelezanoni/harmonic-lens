// Export pinned-Praat WASM pitch/HNR through golden TSV ABI.
// Usage: node scripts/export-praat-wasm-pitch-harmonicity.mjs <wav> <output-directory>
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import createPraatModule from '../analysis-output/praat-wasm-wrapper/praat-pitch-harmonicity.js';

const [inputPath, outputDirectory] = process.argv.slice(2);
if (!inputPath || !outputDirectory) throw new Error('usage: node scripts/export-praat-wasm-pitch-harmonicity.mjs <wav> <output-directory>');
const wav = await readFile(inputPath);
const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
if (wav.subarray(0, 4).toString() !== 'RIFF' || wav.subarray(8, 12).toString() !== 'WAVE') throw new Error(`not a RIFF/WAVE file: ${inputPath}`);
let format, channels, sampleRate, bitsPerSample, data;
for (let offset = 12; offset + 8 <= wav.length;) {
  const id = wav.subarray(offset, offset + 4).toString(), length = view.getUint32(offset + 4, true), start = offset + 8;
  if (start + length > wav.length) throw new Error('truncated WAV chunk');
  if (id === 'fmt ') { format = view.getUint16(start, true); channels = view.getUint16(start + 2, true); sampleRate = view.getUint32(start + 4, true); bitsPerSample = view.getUint16(start + 14, true); }
  else if (id === 'data') data = wav.subarray(start, start + length);
  offset = start + length + (length & 1);
}
if (format !== 1 || !channels || !sampleRate || bitsPerSample !== 16 || !data) throw new Error('only PCM signed 16-bit WAV is supported');
const sampleCount = data.length / (channels * 2);
if (!Number.isInteger(sampleCount)) throw new Error('invalid WAV data length');
const pcm = new Float32Array(channels * sampleCount);
for (let frame = 0; frame < sampleCount; frame += 1) for (let channel = 0; channel < channels; channel += 1) pcm[channel * sampleCount + frame] = view.getInt16(data.byteOffset - wav.byteOffset + 2 * (frame * channels + channel), true) / 32768;

const module = await createPraatModule(), input = module._malloc(pcm.byteLength), inputStruct = module._malloc(24), meta = module._malloc(24);
if (!input || !inputStruct || !meta) throw new Error('WASM allocation failed');
try {
  new Float32Array(module.HEAPF32.buffer, input, pcm.length).set(pcm);
  const memory = new DataView(module.HEAPU8.buffer);
  memory.setUint32(inputStruct, input, true); memory.setInt32(inputStruct + 4, channels, true); memory.setInt32(inputStruct + 8, sampleCount, true); memory.setFloat64(inputStruct + 16, 1 / sampleRate, true);
  const run = (name, invoke) => {
    if (invoke(0, 0) !== 3) throw new Error(`${name} preflight failed`);
    const frames = memory.getInt32(meta, true);
    if (frames < 1) throw new Error(`${name} invalid metadata`);
    const output = module._malloc(frames * Float64Array.BYTES_PER_ELEMENT);
    if (!output) throw new Error('WASM allocation failed');
    try {
      if (invoke(output, frames) !== 0) throw new Error(`${name} export failed`);
      const firstTime = memory.getFloat64(meta + 8, true), timeStep = memory.getFloat64(meta + 16, true), values = new Float64Array(module.HEAPF64.buffer, output, frames);
      return { frames, firstTime, timeStep, values: [...values] };
    } finally { module._free(output); }
  };
  const pitch = run('pitch', (output, capacity) => module._praat_pitch_raw_ac_v1(inputStruct, 0.01, 75, 600, 15, 0, 0.03, 0.45, 0.01, 0.35, 0.14, output, capacity, meta));
  const harmonicity = run('harmonicity', (output, capacity) => module._praat_harmonicity_cc_v1(inputStruct, 0.01, 75, 0.1, 1, output, capacity, meta));
  const tsv = (label, track, format = value => value) => [`frame\ttime_seconds\t${label}`, ...track.values.map((value, index) => `${index + 1}\t${track.firstTime + index * track.timeStep}\t${format(value)}`)].join('\n') + '\n';
  // Praat scripting writes an unvoiced zero-Hz Pitch candidate as this token.
  const pitchValue = value => value === 0 ? '--undefined--' : value;
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([writeFile(join(outputDirectory, 'pitch.tsv'), tsv('hz', pitch, pitchValue)), writeFile(join(outputDirectory, 'harmonicity.tsv'), tsv('db', harmonicity))]);
  console.log(`pitch frames=${pitch.frames}; harmonicity frames=${harmonicity.frames}; path=${outputDirectory}`);
} finally { module._free(meta); module._free(inputStruct); module._free(input); }
