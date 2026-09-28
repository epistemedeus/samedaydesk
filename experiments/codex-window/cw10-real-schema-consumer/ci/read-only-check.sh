#!/usr/bin/env sh
set -eu

: "${USEFUL_JOBS_ROOT:?point USEFUL_JOBS_ROOT at extracted useful-jobs-1.4.0}"
HERE=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT HUP INT TERM

npm --prefix "$HERE" ci --ignore-scripts
node "$HERE/bin/check.mjs" --archive-root="$USEFUL_JOBS_ROOT" --out-dir="$OUT"
npm --prefix "$HERE" test
