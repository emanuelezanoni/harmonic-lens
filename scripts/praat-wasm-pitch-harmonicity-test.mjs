// Deterministic smoke test: ABI preflight/output, raw-AC 220 Hz, CC HNR.
import createPraatModule from '../analysis-output/praat-wasm-wrapper/praat-pitch-harmonicity.js';
const module = await createPraatModule(), samples = 44_100, input = module._malloc(samples * 4), inputStruct = module._malloc(24), meta = module._malloc(24), output = module._malloc(2_000 * 8);
if (!input || !inputStruct || !meta || !output) throw new Error('WASM allocation failed');
try {
  const pcm = new Float32Array(module.HEAPF32.buffer, input, samples), view = new DataView(module.HEAPU8.buffer);
  for (let i = 0; i < samples; i += 1) pcm[i] = Math.fround(0.5 * Math.sin((2 * Math.PI * 220 * i) / 44_100));
  view.setUint32(inputStruct, input, true); view.setInt32(inputStruct + 4, 1, true); view.setInt32(inputStruct + 8, samples, true); view.setFloat64(inputStruct + 16, 1 / 44_100, true);
  const pitch = (out, cap) => module._praat_pitch_raw_ac_v1(inputStruct, .01, 75, 600, 15, 0, .03, .45, .01, .35, .14, out, cap, meta);
  if (pitch(0, 0) !== 3) throw new Error('pitch preflight failed'); const pitchFrames = view.getInt32(meta, true); if (pitchFrames < 1 || pitchFrames > 2_000 || pitch(output, pitchFrames) !== 0) throw new Error('pitch output failed');
  const hz = new Float64Array(module.HEAPF64.buffer, output, pitchFrames)[10]; if (Math.abs(hz - 220) > .01) throw new Error(`unexpected pitch=${hz}`);
  const hnr = (out, cap) => module._praat_harmonicity_cc_v1(inputStruct, .01, 75, .1, 1, out, cap, meta);
  if (hnr(0, 0) !== 3) throw new Error('harmonicity preflight failed'); const hnrFrames = view.getInt32(meta, true); if (hnrFrames < 1 || hnrFrames > 2_000 || hnr(output, hnrFrames) !== 0) throw new Error('harmonicity output failed');
  const db = new Float64Array(module.HEAPF64.buffer, output, hnrFrames)[10]; if (!Number.isFinite(db) || db < 20) throw new Error(`unexpected HNR=${db}`);
  console.log(`pitch frames=${pitchFrames} hz=${hz}; harmonicity frames=${hnrFrames} db=${db}`);
} finally { module._free(output); module._free(meta); module._free(inputStruct); module._free(input); }
