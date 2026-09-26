import { defineConfig } from "vite";

// Build-only M2 entry: validates Worker URL rewriting without renderer wiring.
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: { entry: "src/dsp/praat-runtime-backend.ts", formats: ["es"], fileName: "praat-runtime-backend" },
    outDir: "dist/runtime"
  }
});
