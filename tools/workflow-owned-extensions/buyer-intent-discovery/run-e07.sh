#!/usr/bin/env bash
set -euo pipefail
set +x
: "${ROOT:?set ROOT to a fresh absolute checkout path}"
: "${OUT:?set OUT to a fresh absolute artifact path}"
: "${TIP:?set TIP to the exact 40-character source commit}"
: "${BRANCH:?set BRANCH to codex/n7-e07-buyer-intent-20261105}"
[[ "$ROOT" = /* && "$OUT" = /* && "$ROOT" != "$OUT" && "$TIP" =~ ^[0-9a-f]{40}$ ]]
[[ "$BRANCH" = codex/n7-e07-buyer-intent-20261105 ]]
[[ "$OUT/" != "$ROOT/"* && "$ROOT/" != "$OUT/"* ]]
[[ ! -e "$ROOT" && ! -e "$OUT" ]]
mkdir -p "$OUT"
finish() {
  local result=$?
  printf 'runner\t%s\n' "$result" >> "$OUT/EXITS"
  (cd "$OUT" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
}
trap finish EXIT
printf 'step\texit\n' > "$OUT/EXITS"
git init -q "$ROOT"
git -C "$ROOT" remote add origin https://github.com/epistemedeus/samedaydesk.git
git -C "$ROOT" fetch --depth=1 origin "$BRANCH" > "$OUT/fetch.log" 2>&1
[[ "$(git -C "$ROOT" rev-parse FETCH_HEAD)" = "$TIP" ]]
git -C "$ROOT" checkout -q --detach "$TIP"
cd "$ROOT"
printf '%s\n' "$TIP" > "$OUT/SOURCE_COMMIT"
node --version > "$OUT/node-version.txt"
[[ "$(node -p 'process.versions.node.split(".")[0]')" = 22 ]]
p=tools/workflow-owned-extensions/buyer-intent-discovery
set +e
node --test "$p/test/discovery.test.mjs" > "$OUT/tests.log" 2>&1
tests=$?
printf 'pure_tests\t%s\n' "$tests" >> "$OUT/EXITS"
node "$p/cli.mjs" --query-file "$p/queries.json" --out "$OUT/live" > "$OUT/live.log" 2>&1
live=$?
printf 'live_acquisition\t%s\n' "$live" >> "$OUT/EXITS"
set -e
[[ "$tests" = 0 && "$live" = 0 ]]
