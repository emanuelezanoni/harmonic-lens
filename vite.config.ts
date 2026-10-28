import { defineConfig } from "vite";

// Relative base: the same dist/ must load from http(s) and from file:// inside Electron.
export default defineConfig({ base: "./" });
