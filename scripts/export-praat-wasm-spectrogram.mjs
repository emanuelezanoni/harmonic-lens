// Export the existing spectrogram-only WASM wrapper through the golden TSV ABI.
// Usage: node scripts/export-praat-wasm-spectrogram.mjs <wav> <output-directory>
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import createPraatModule from '../analysis-output/praat-wasm-wrapper/praat-spectrogram.js';

const [inputPath, outputDirectory] = process.argv.slice(2);
if (!inputPath || !outputDirectory) {
  throw new Error('usage: node scripts/export-praat-wasm-spectrogram.mjs <wav> <output-directory>');
}

const wav = await readFile(inputPath);
const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
if (wav.subarray(0, 4).toString() !== 'RIFF' || wav.subarray(8, 12).toString() !== 'WAVE') {
  throw new Error(`not a RIFF/WAVE file: ${inputPath}`);
}
let format, channels, sampleRate, bitsPerSample, data;
for (let offset = 12; offset + 8 <= wav.length;) {
  const id = wav.subarray(offset, offset + 4).toString();
  const length = view.getUint32(offset + 4, true);
  const start = offset + 8;
  if (start + length > wav.length) throw new Error('truncated WAV chunk');
  if (id === 'fmt ') {
    format = view.getUint16(start, true);
    channels = view.getUint16(start + 2, true);
    sampleRate = view.getUint32(start + 4, true);
    bitsPerSample = view.getUint16(start + 14, true);
  } else if (id === 'data') data = wav.subarray(start, start + length);
  offset = start + length + (length & 1);
}
if (format !== 1 || !channels || !sampleRate || bitsPerSample !== 16 || !data) {
  throw new Error('only PCM signed 16-bit WAV is supported by this exporter');
}
const sampleCount = data.length / (channels * 2);
if (!Number.isInteger(sampleCount)) throw new Error('invalid WAV data length');
const pcm = new Float32Array(channels * sampleCount);
for (let frame = 0; frame < sampleCount; frame += 1) {
  for (let channel = 0; channel < channels; channel += 1) {
    pcm[channel * sampleCount + frame] = view.getInt16(data.byteOffset - wav.byteOffset + 2 * (frame * channels + channel), true) / 32768;
  }
}

const module = await createPraatModule();
const inputBytes = pcm.byteLength;
const input = module._malloc(inputBytes);
const inputStruct = module._malloc(24); // wasm32: pointer, int32, int32, padding, double
const meta = module._malloc(40); // wasm32: int32, int32, four doubles
if (!input || !inputStruct || !meta) throw new Error('WASM allocation failed');
try {
  new Float32Array(module.HEAPF32.buffer, input, pcm.length).set(pcm);
  const memory = new DataView(module.HEAPU8.buffer);
  memory.setUint32(inputStruct, input, true);
  memory.setInt32(inputStruct + 4, channels, true);
  memory.setInt32(inputStruct + 8, sampleCount, true);
  memory.setFloat64(inputStruct + 16, 1 / sampleRate, true);
  const invoke = (power, capacity) => module._praat_spectrogram_v1(inputStruct, 0.005, 5000, 0.002, 20, 4, power, capacity, meta);
  if (invoke(0, 0) !== 3) throw new Error('spectrogram preflight failed');
  const frames = memory.getInt32(meta, true);
  const bins = memory.getInt32(meta + 4, true);
  const count = frames * bins;
  if (frames < 1 || bins < 1 || count > 0x7fffffff) throw new Error('invalid WASM metadata');
  const power = module._malloc(count * Float64Array.BYTES_PER_ELEMENT);
  if (!power) throw new Error('WASM allocation failed');
  try {
    if (invoke(power, count) !== 0) throw new Error('spectrogram export failed');
    const firstTime = memory.getFloat64(meta + 8, true);
    const timeStep = memory.getFloat64(meta + 16, true);
    const firstFrequency = memory.getFloat64(meta + 24, true);
    const frequencyStep = memory.getFloat64(meta + 32, true);
    const values = new Float64Array(module.HEAPF64.buffer, power, count);
    const lines = ['frame\ttime_seconds\tbin\tfrequency_hz\tpower'];
    for (let frame = 0; frame < frames; frame += 1) for (let bin = 0; bin < bins; bin += 1) {
      lines.push(`${frame + 1}\t${firstTime + frame * timeStep}\t${bin + 1}\t${firstFrequency + bin * frequencyStep}\t${values[frame * bins + bin]}`);
    }
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(join(outputDirectory, 'spectrogram.tsv'), `${lines.join('\n')}\n`);
    console.log(`spectrogram TSV: frames=${frames} bins=${bins} path=${join(outputDirectory, 'spectrogram.tsv')}`);
  } finally { module._free(power); }
} finally {
  module._free(meta);
  module._free(inputStruct);
  module._free(input);
}
