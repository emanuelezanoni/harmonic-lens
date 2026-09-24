import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sampleRate = 44_100;
const frameCount = sampleRate;
const outputDir = resolve('tests/praat-golden/fixtures');
const checkOnly = process.argv.includes('--check');
const fixtures = [
  ['sine-220-mono', 1, (t) => 0.5 * Math.sin(2 * Math.PI * 220 * t)],
  ['harmonics-110-mono', 1, (t) => 0.42 * Math.sin(2 * Math.PI * 110 * t) + 0.18 * Math.sin(2 * Math.PI * 220 * t) + 0.08 * Math.sin(2 * Math.PI * 330 * t)],
  ['sine-220-stereo-duplicate', 2, (t) => 0.5 * Math.sin(2 * Math.PI * 220 * t)],
  ['silence-mono', 1, () => 0]
];

function wav(channels, sampleAt) {
  const bytes = Buffer.alloc(44 + frameCount * channels * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8);
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(channels, 22); bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * channels * 2, 28); bytes.writeUInt16LE(channels * 2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(frameCount * channels * 2, 40);
  for (let frame = 0; frame < frameCount; frame++) {
    const pcm = Math.round(Math.max(-1, Math.min(1, sampleAt(frame / sampleRate))) * 32767);
    for (let channel = 0; channel < channels; channel++) bytes.writeInt16LE(pcm, 44 + (frame * channels + channel) * 2);
  }
  return bytes;
}

if (!checkOnly) mkdirSync(outputDir, { recursive: true });
let failed = false;
for (const [id, channels, sampleAt] of fixtures) {
  const bytes = wav(channels, sampleAt);
  const path = resolve(outputDir, `${id}.wav`);
  if (checkOnly) {
    try { if (!readFileSync(path).equals(bytes)) throw new Error('bytes differ'); }
    catch { console.error(`fixture mismatch: ${path}; run npm run praat:fixtures`); failed = true; }
  } else writeFileSync(path, bytes);
  console.log(`${id}.wav ${createHash('sha256').update(bytes).digest('hex')}`);
}
if (failed) process.exitCode = 1;
