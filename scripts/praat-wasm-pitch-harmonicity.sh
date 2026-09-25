#!/usr/bin/env bash
# Link only pinned Praat Emscripten archives. Output remains ignored.
set -euo pipefail

readonly praat_dir="reference/praat"
readonly output_dir="analysis-output/praat-wasm-wrapper"
readonly zconf_header="${PRAAT_ZCONF_HEADER:-/usr/include/zconf.h}"
readonly expected_commit="6f3da9ef1d8cce0d5684afc104d02888dfc71b25"
[[ -r "$zconf_header" ]] || { echo "blocked: zconf.h missing: $zconf_header" >&2; exit 126; }
actual_commit="$(git -c safe.directory="$PWD/$praat_dir" -C "$praat_dir" rev-parse HEAD)"
[[ "$actual_commit" == "$expected_commit" ]] || { echo "blocked: Praat pin mismatch: $actual_commit" >&2; exit 3; }
dirty_status="$(git -c safe.directory="$PWD/$praat_dir" -C "$praat_dir" status --porcelain | sed '/^?? praat_barren$/d')"
[[ -z "$dirty_status" ]] || { echo "blocked: pinned checkout dirty" >&2; exit 4; }
mkdir -p "$output_dir"
zconf_dir="$(mktemp -d)"; trap 'rm -rf "$zconf_dir"' EXIT; cp "$zconf_header" "$zconf_dir/zconf.h"
for archive in fon/libfon.a stat/libstat.a dwsys/libdwsys.a sys/libsys.a melder/libmelder.a kar/libkar.a external/num/libnum.a; do
	[[ -f "$praat_dir/$archive" ]] || { echo "blocked: missing $praat_dir/$archive; run scripts/praat-wasm-probe.sh first" >&2; exit 5; }
done
em++ -DNO_AUDIO -DUNIX -Dlinux -DNO_GRAPHICS -std=c++17 -O0 \
	-I "$zconf_dir" -I "$praat_dir/fon" -I "$praat_dir/melder" -I "$praat_dir/sys" -I "$praat_dir/dwsys" -I "$praat_dir/stat" -I "$praat_dir/kar" \
	src/dsp/praat/praat_pitch_harmonicity_wrapper.cpp \
	"$praat_dir/fon/libfon.a" "$praat_dir/stat/libstat.a" "$praat_dir/dwsys/libdwsys.a" "$praat_dir/sys/libsys.a" "$praat_dir/melder/libmelder.a" "$praat_dir/kar/libkar.a" "$praat_dir/external/num/libnum.a" \
	-sENVIRONMENT=node -sMODULARIZE=1 -sEXPORT_ES6=1 -sFILESYSTEM=0 \
	-sEXPORTED_FUNCTIONS='["_malloc","_free","_praat_pitch_raw_ac_v1","_praat_harmonicity_cc_v1"]' \
	-o "$output_dir/praat-pitch-harmonicity.js"
