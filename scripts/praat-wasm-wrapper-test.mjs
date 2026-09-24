// Deterministic Node smoke test for scripts/praat-wasm-wrapper.sh output.
import createPraatModule from '../analysis-output/praat-wasm-wrapper/praat-spectrogram.js';

const module = await createPraatModule();
const samples = 44_100;
const sampleRate = 44_100;
const inputBytes = samples * Float32Array.BYTES_PER_ELEMENT;
const powerCapacity = 500_000;
const powerBytes = powerCapacity * Float64Array.BYTES_PER_ELEMENT;
const input = module._malloc(inputBytes);
const power = module._malloc(powerBytes);
const meta = module._malloc(40); // wasm32 layout: int32, int32, four doubles.
if (!input || !power || !meta) throw new Error('WASM allocation failed');

try {
  const pcm = new Float32Array(module.HEAPF32.buffer, input, samples);
  for (let index = 0; index < samples; index += 1) {
    pcm[index] = Math.fround(0.5 * Math.sin((2 * Math.PI * 220 * index) / sampleRate));
  }
  const inputStruct = module._malloc(24); // wasm32: ptr, int32, int32, double.
  if (!inputStruct) throw new Error('WASM allocation failed');
  try {
    const view = new DataView(module.HEAPU8.buffer);
    view.setUint32(inputStruct, input, true);
    view.setInt32(inputStruct + 4, 1, true);
    view.setInt32(inputStruct + 8, samples, true);
    view.setFloat64(inputStruct + 16, 1 / sampleRate, true);
    // Keep this ABI invocation byte-for-byte aligned with
    // tests/praat-golden/manifest.json's spectrogram contract.
    const preflightStatus = module._praat_spectrogram_v1(
      inputStruct, 0.005, 5_000, 0.002, 20, 4, 0, 0, meta,
    );
    if (preflightStatus !== 3) throw new Error(`preflight status=${preflightStatus}`);
    const frames = view.getInt32(meta, true);
    const bins = view.getInt32(meta + 4, true);
    if (frames < 1 || bins < 1 || frames * bins > powerCapacity) throw new Error('invalid preflight metadata');
    const status = module._praat_spectrogram_v1(
      inputStruct, 0.005, 5_000, 0.002, 20, 4, power, powerCapacity, meta,
    );
    if (status !== 0) throw new Error(`praat_spectrogram_v1 status=${status}`);
    const firstFrequency = view.getFloat64(meta + 24, true);
    const frequencyStep = view.getFloat64(meta + 32, true);
    if (frames < 1 || bins < 1 || frames * bins > powerCapacity) throw new Error('invalid WASM metadata');
    const values = new Float64Array(module.HEAPF64.buffer, power, frames * bins);
    let peakBin = 0;
    let peakPower = -Infinity;
    for (let bin = 0; bin < bins; bin += 1) {
      const value = values[10 * bins + bin];
      if (value > peakPower) { peakPower = value; peakBin = bin; }
    }
    const peakHz = firstFrequency + peakBin * frequencyStep;
    if (Math.abs(peakHz - 220) > frequencyStep) throw new Error(`unexpected spectral peak=${peakHz}`);
    console.log(`spectrogram frames=${frames} bins=${bins} peakHz=${peakHz} peakPower=${peakPower}`);
  } finally {
    module._free(inputStruct);
  }
} finally {
  module._free(meta);
  module._free(power);
  module._free(input);
}
