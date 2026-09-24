#!/usr/bin/env bash
# Praat WebAssembly build probe for Harmonic Lens.
# Provenance: runs unmodified praat/praat v7.0.02 at
# 6f3da9ef1d8cce0d5684afc104d02888dfc71b25. No Praat source imported.
# Future wrapper/source linked to this output retains GPL-2.0-or-later notices.

set -euo pipefail
readonly praat_dir="reference/praat"
readonly praat_commit="6f3da9ef1d8cce0d5684afc104d02888dfc71b25"

if ! command -v emcc >/dev/null 2>&1 || ! command -v em++ >/dev/null 2>&1; then
  echo "blocked: Emscripten missing: need emcc and em++ on PATH" >&2
  echo "install durable Emscripten SDK through sanctioned sandbox installer; rerun $0" >&2
  exit 127
fi
if [[ ! -d "$praat_dir/.git" ]]; then
  echo "blocked: missing pinned checkout: $praat_dir" >&2
  exit 2
fi
actual_commit="$(git -c safe.directory="$PWD/$praat_dir" -C "$praat_dir" rev-parse HEAD)"
if [[ "$actual_commit" != "$praat_commit" ]]; then
  echo "blocked: Praat pin mismatch: got $actual_commit, need $praat_commit" >&2
  exit 3
fi
if [[ -n "$(git -c safe.directory="$PWD/$praat_dir" -C "$praat_dir" status --porcelain)" ]]; then
  echo "blocked: pinned Praat checkout dirty: $praat_dir" >&2
  exit 4
fi

# Upstream has Linux GCC/Clang paths, no Emscripten target. Barren/audio-none
# + compiler/linker substitution only: DSP stays upstream-identical.
emmake make -C "$praat_dir" \
  PRAAT_GRAPHICS=barren PRAAT_AUDIO=none PRAAT_COMPILER=clang \
  CC=emcc CXX=em++ LINKER_COMMAND='em++ -sENVIRONMENT=node' \
  -j"$(nproc)"
if [[ -f "$praat_dir/praat_barren.js" ]]; then
  node "$praat_dir/praat_barren.js" --run scripts/praat-native-probe.praat
else
  echo "blocked: Emscripten build produced no runnable praat_barren.js" >&2
  exit 5
fi
