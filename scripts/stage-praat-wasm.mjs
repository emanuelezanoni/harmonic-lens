#!/usr/bin/env node
/** Copy the pinned, locally-built browser Worker artifacts into Vite public/. */
import { copyFile, mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve("analysis-output/praat-wasm-wrapper");
const target = resolve("public/praat-wasm");
const files = [
  "praat-spectrogram.js", "praat-spectrogram.wasm",
  "praat-pitch-harmonicity.js", "praat-pitch-harmonicity.wasm"
];

await mkdir(target, { recursive: true });
for (const file of files) {
  const input = resolve(source, file);
  try {
    const metadata = await stat(input);
    if (!metadata.isFile() || metadata.size === 0) throw new Error("not a non-empty file");
  } catch (error) {
    throw new Error(`Missing browser Praat artifact ${input}; run the two praat:wasm build commands first.`, { cause: error });
  }
  await copyFile(input, resolve(target, file));
}
console.log(`Staged ${files.length} Praat WASM artifacts in public/praat-wasm.`);
