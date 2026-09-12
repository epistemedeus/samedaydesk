#!/usr/bin/env sh
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export NODE_OPTIONS=--max-old-space-size=768
# GNU tar passes this to the release's unchanged nested tar invocations too.
export TAR_OPTIONS=--no-same-owner
OWNED=$(mktemp -d "${TMPDIR:-/tmp}/cw10-ci.XXXXXX")
trap 'rm -rf "$OWNED"' EXIT HUP INT TERM

npm --prefix "$HERE" ci --ignore-scripts --no-audit --no-fund
npm --prefix "$HERE" test
set -- --mode audit --out-dir "${CW10_OUTPUT_DIR:-$OWNED/audit}" --release-tests run
if [ -n "${CW10_CANDIDATE_HEAD:-}" ]; then
  set -- "$@" --candidate-head "$CW10_CANDIDATE_HEAD"
  if [ -n "${CW10_CANDIDATE_REPO:-}" ]; then
    set -- "$@" --candidate-repo "$CW10_CANDIDATE_REPO"
  fi
fi
node "$HERE/bin/check.mjs" "$@"
# Audit success means a known counterexample reproduced. A compatibility gate
# must fail on the same request-body change, despite the engine's exit 0.
GATE_EXIT=0
node "$HERE/bin/check.mjs" --out-dir "$OWNED/gate" > "$OWNED/gate.stdout" 2> "$OWNED/gate.stderr" || GATE_EXIT=$?
[ "$GATE_EXIT" -eq 1 ] || { cat "$OWNED/gate.stderr" >&2; exit 1; }
printf '%s\n' 'CW10 accepted: consumer regressions passed; released suite 15/15; compatibility gate correctly exits 1.'
