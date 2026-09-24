#!/usr/bin/env bash
# Praat WebAssembly build probe for Harmonic Lens.
# Provenance: runs unmodified praat/praat v7.0.02 at
# 6f3da9ef1d8cce0d5684afc104d02888dfc71b25. No Praat source imported.
# Future wrapper/source linked to this output retains GPL-2.0-or-later notices.

set -euo pipefail
readonly praat_dir="reference/praat"
readonly praat_commit="6f3da9ef1d8cce0d5684afc104d02888dfc71b25"
readonly zconf_header="${PRAAT_ZCONF_HEADER:-/usr/include/zconf.h}"

if ! command -v emcc >/dev/null 2>&1 || ! command -v em++ >/dev/null 2>&1; then
  echo "blocked: Emscripten missing: need emcc and em++ on PATH" >&2
  echo "install durable Emscripten SDK through sanctioned sandbox installer; rerun $0" >&2
  exit 127
fi
if [[ ! -r "$zconf_header" ]]; then
  echo "blocked: zlib development header missing: $zconf_header" >&2
  echo "install durable zlib development headers, or set PRAAT_ZCONF_HEADER to a target-reviewed zconf.h" >&2
  exit 126
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

# Upstream has Linux GCC/Clang paths, no Emscripten target. Remove ignored
# native objects first: make otherwise reuses them, which cannot prove an
# Emscripten compile. Barren/audio-none + compiler/linker substitution only:
# DSP stays upstream-identical.
zconf_dir="$(mktemp -d)"
trap 'rm -rf "$zconf_dir"' EXIT
cp "$zconf_header" "$zconf_dir/zconf.h"

# zlib.h includes its generated zconf.h with quotes. Isolate that header: adding
# /usr/include directly would shadow Emscripten libc headers. `all` has parallel
# all-external/all-self prerequisites, although self needs external archives;
# stage them without changing any upstream source or DSP.
make -C "$praat_dir" clean
build=(
  PRAAT_GRAPHICS=barren PRAAT_AUDIO=none PRAAT_COMPILER=clang
  CC='emcc -DNO_AUDIO' CXX='em++ -DNO_AUDIO'
  LINKER_COMMAND='em++ -sENVIRONMENT=node'
)
CPPFLAGS="-I $zconf_dir" emmake make -C "$praat_dir" "${build[@]}" all-external -j"$(nproc)"
CPPFLAGS="-I $zconf_dir" emmake make -C "$praat_dir" "${build[@]}" all-self -j"$(nproc)"
CPPFLAGS="-I $zconf_dir" emmake make -C "$praat_dir" "${build[@]}" praat_barren
if [[ -f "$praat_dir/praat_barren.js" ]]; then
  node "$praat_dir/praat_barren.js" --run scripts/praat-native-probe.praat
else
  echo "blocked: Emscripten build produced no runnable praat_barren.js" >&2
  exit 5
fi
