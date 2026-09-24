#!/usr/bin/env bash
# Native pinned-Praat reference export. No source/audio download; inputs tracked.
set -euo pipefail
readonly repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
readonly praat_dir="$repo_root/reference/praat"
readonly praat_commit="6f3da9ef1d8cce0d5684afc104d02888dfc71b25"
readonly fixture_dir="$repo_root/tests/praat-golden/fixtures"
readonly output_dir="${PRAAT_GOLDEN_REFERENCE_DIR:-$repo_root/analysis-output/praat-reference}"

cd "$repo_root"

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
dirty_status="$(git -c safe.directory="$PWD/$praat_dir" -C "$praat_dir" status --porcelain | sed '/^?? praat_barren$/d')"
if [[ -n "$dirty_status" ]]; then
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
