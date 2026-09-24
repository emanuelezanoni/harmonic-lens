#!/usr/bin/env bash
# Native pinned-Praat reference export. No source/audio download; inputs tracked.
set -euo pipefail
readonly praat_dir="reference/praat"
readonly praat_commit="6f3da9ef1d8cce0d5684afc104d02888dfc71b25"
readonly fixture_dir="tests/praat-golden/fixtures"
readonly output_dir="${PRAAT_GOLDEN_REFERENCE_DIR:-analysis-output/praat-reference}"

npm run praat:fixtures:check
if [[ ! -x "$praat_dir/praat_barren" ]]; then
  echo "blocked: missing $praat_dir/praat_barren; build pinned native oracle per docs/praat-golden.md" >&2
  exit 127
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
mkdir -p "$output_dir"
for fixture in "$fixture_dir"/*.wav; do
  id="$(basename "$fixture" .wav)"
  mkdir -p "$output_dir/$id"
  "$praat_dir/praat_barren" --run scripts/praat-golden-export.praat "$fixture" "$output_dir/$id"
done
printf 'native reference: %s\n' "$output_dir"
