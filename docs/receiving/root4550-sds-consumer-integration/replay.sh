#!/usr/bin/env bash
# Run from this exact source export with Node22, locked root dependencies,
# OpenSSL and PG16. Every group is serial. No provider/installation operation.
set -euo pipefail
cd "$(dirname "$0")/../../.."
export NODE_OPTIONS=--max-old-space-size=512
node --test --test-concurrency=1 server/lib/machine-services/test/monitor-manifest-journey.test.mjs server/lib/machine-services/test/lifecycle.test.mjs
node --test --test-concurrency=1 --test-name-pattern='checked-in machine and API contracts' server/vendor/continuous-monitoring/test/04-entitlement-contract.test.mjs
bash docs/receiving/r4-requester-proposals/receive.sh candidate
bash docs/receiving/r4-requester-proposals/receive.sh candidate server/scripts/test-root410-requester-receiving.mjs
bash docs/receiving/r4-requester-proposals/receive.sh candidate server/scripts/test-root425-cold-mutation.mjs
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 server/scripts/test-r4-wallet-continuation.mjs
R4_WALLET_REGRESSION=1 NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 server/scripts/test-r4-wallet-continuation.mjs
R4_WALLET_DIRECT_SOURCE=1 NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 server/scripts/test-r4-wallet-continuation.mjs
R4_MONITOR_DIRECT_SOURCE=1 node --test --test-concurrency=1 server/lib/machine-services/test/monitor-manifest-journey.test.mjs server/lib/machine-services/test/lifecycle.test.mjs
