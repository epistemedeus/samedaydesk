#!/usr/bin/env bash
set -euo pipefail
R4_REPO=$(cd "$(dirname "$0")/../../.." && pwd)
R4_MODE=${1:-candidate}
R4_RECEIVER=${2:-server/scripts/test-r4-requester-proposal-review.mjs}
R4_COPY=$(mktemp -d /tmp/root4432-source-XXXXXX)
trap 'rm -rf "$R4_COPY"' EXIT
case "$R4_MODE" in
  baseline) R4_REF=79fbd37d31aabdc790248443c576a2f0017e55f0 ;;
  candidate) R4_REF=HEAD ;;
  *) exit 2 ;;
esac
git -C "$R4_REPO" archive "$R4_REF" | tar -x -C "$R4_COPY"
ln -s "$R4_REPO/node_modules" "$R4_COPY/node_modules"
cp "$R4_REPO/server/scripts/test-r4-requester-proposal-review.mjs" "$R4_COPY/server/scripts/"
if [[ "$R4_MODE" == candidate ]]; then
  for R4_MEMBER in vendor/hosted-wallet-market/src/machine-market.mjs vendor/hosted-wallet-market/src/market-interest-read.mjs; do
    cp "$R4_REPO/$R4_MEMBER" "$R4_COPY/$R4_MEMBER"
  done
  # The existing producer updates only this disposable copy. Its output is
  # explicitly qualified:false, installed:false; writer-branch shared pins stay intact.
  (cd "$R4_COPY" && node server/scripts/refresh-installed-receiving-source.mjs)
  (cd "$R4_COPY" && node --input-type=module -e "import {readFileSync} from 'node:fs'; import {createHash} from 'node:crypto'; import {installedSourceSha256,hostSourceSha256} from './vendor/hosted-wallet-market/src/native-debt.mjs'; console.log(JSON.stringify({candidatePackageSha256:installedSourceSha256(),candidateHostSha256:hostSourceSha256(process.cwd()),candidatePinSha256:createHash('sha256').update(readFileSync('server/foundry/activation/private-control-pin.json')).digest('hex'),qualified:false,installed:false}));")
fi
if [[ "${3:-}" == root425-fixture ]]; then
  [[ "$R4_RECEIVER" == server/scripts/test-root425-cold-mutation.mjs ]]
  (cd "$R4_COPY" && git apply "$R4_REPO/docs/receiving/r4-requester-proposals/root425-fixture.patch")
fi
(cd "$R4_COPY" && R4_EXPECT_BASELINE=$([[ "$R4_MODE" == baseline ]] && echo 1 || echo 0) \
  NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 "$R4_RECEIVER")
