#!/usr/bin/env bash
# Expected exit 1: execute the two acceptance failures on the exact admitted
# predecessor, using the same final receiver. Does not change branch or origin.
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"
scratch="$(mktemp -d /tmp/root4431-baseline-XXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
git archive 79fbd37d31aabdc790248443c576a2f0017e55f0 | tar -x -C "$scratch"
cp -- "$repo_root/server/lib/machine-services/test/monitor-manifest-journey.test.mjs" "$scratch/server/lib/machine-services/test/monitor-manifest-journey.test.mjs"
ln -s -- "$repo_root/node_modules" "$scratch/node_modules"
cd "$scratch"
R4_MONITOR_BASELINE=1 NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 server/lib/machine-services/test/monitor-manifest-journey.test.mjs
