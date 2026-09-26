#!/usr/bin/env node
/** Copy the pinned, locally-built browser Worker artifacts into Vite public/. */
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const source = resolve("analysis-output/praat-wasm-wrapper");
const target = resolve("public/praat-wasm");
const manifest = JSON.parse(await readFile(resolve(target, "manifest.json"), "utf8"));
const files = Object.keys(manifest.artifacts);
const checkOnly = process.argv.includes("--check");

for (const file of files) {
  const output = resolve(target, file);
  if (!checkOnly) {
    const input = resolve(source, file);
    try {
      const metadata = await stat(input);
      if (!metadata.isFile() || metadata.size === 0) throw new Error("not a non-empty file");
    } catch (error) {
      throw new Error(`Missing browser Praat artifact ${input}; run the two praat:wasm build commands first.`, { cause: error });
    }
    await mkdir(target, { recursive: true });
    await copyFile(input, output);
  }
  try {
    const metadata = await stat(output);
    if (!metadata.isFile() || metadata.size === 0) throw new Error("not a non-empty file");
  } catch (error) {
    throw new Error(`Missing staged browser Praat artifact ${output}.`, { cause: error });
  }
  const actual = createHash("sha256").update(await readFile(output)).digest("hex");
  if (actual !== manifest.artifacts[file]) throw new Error(`Praat artifact hash mismatch: ${output}; expected ${manifest.artifacts[file]}, got ${actual}.`);
}
console.log(`${checkOnly ? "Verified" : "Staged and verified"} ${files.length} Praat WASM artifacts in public/praat-wasm.`);
