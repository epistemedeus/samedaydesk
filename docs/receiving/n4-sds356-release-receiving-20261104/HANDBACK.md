# HANDBACK N4-SDS356-RELEASE-RECEIVING

- Branch: `codex/n4-sds356-release-receiving-20261104`
- Subject base: `0593026ad155352f263e4749dc889a1578d91675`
- Subject head: `f4fba79fda839e8bfbad47b2b6883d8c2c9791a9`
- Subject tree: `c5e12e30fec8f56806d69741f4c3eb3aef1adcc2`
- Receiving parent: `f4fba79fda839e8bfbad47b2b6883d8c2c9791a9`
- Documents commit: `f19d039525311b5e4b9a7ea95b282b3b16127c64`
- Branch head: the commit that records this line. Its parent is `f19d039525311b5e4b9a7ea95b282b3b16127c64` and its tree contains these four receiving files.
- PR URL: none. No pull request was opened. A pull request into the PR356 branch was out of scope, and a pull request into `main` would carry the unreceived product commits. Nothing was merged.

## Changed paths

Only files under `docs/receiving/n4-sds356-release-receiving-20261104/`:

- `RESULT.md`
- `RESULT.json`
- `HANDBACK.md`
- `enrollment-packet.json`

No PR356 source file, approved catalog file, workflow, provider, store, config, or live host was changed. qualified is false. Root receiving is false.

## Tests

Checkout `f4fba79fda839e8bfbad47b2b6883d8c2c9791a9`, then `npm ci --no-audit --no-fund`, exit 0. Node v22.23.4. PostgreSQL 16.15 at `/usr/lib/postgresql/16/bin` through `PULSE_PG_BIN` and `AE14_PG_BIN`. `ROOT10940_CI_CATALOG` stayed on the committed catalog.

| Command | Exit | Pass | Fail | Skipped | Tests |
| --- | --- | --- | --- | --- | --- |
| `npm run test:pulse` | 0 | 94 | 0 | 0 | 94 |
| `node --experimental-strip-types --test --test-concurrency=1 server/scripts/test-pulse-refusal-contract.js server/scripts/test-pulse-mcp-outcomes-contract.js server/scripts/test-pulse-browse-coverage-contract.js` | 0 | 13 | 0 | 0 | 13 |
| `npm run test:original-task` | 0 | 14 | 0 | 0 | 14 |
| `node --test --test-concurrency=1 experiments/agl-contribution-delegation-20261104/test/contribution-delegation.test.mjs` | 0 | 4 | 0 | 0 | 4 |
| `node --test --test-concurrency=1 experiments/agl-contribution-delegation-20261104/test/handback-row-decision.test.mjs` | 0 | 1 | 0 | 0 | 1 |
| `node --test --test-concurrency=1 --test-timeout=420000 server/scripts/test-h133010-accepted-work.mjs` | 0 | 2 | 0 | 0 | 2 |
| `node --test --test-concurrency=1 server/scripts/test-capability-owner-lookup.js` | 0 | 10 | 0 | 0 | 10 |
| `npm run test:observatory` | 0 | 100 | 0 | 2 | 102 |
| `npm run test:result-reuse` | 0 | 37 | 0 | 0 | 37 |
| `node --test --test-concurrency=1 server/scripts/test-h147010-source-bound-ci-input.mjs server/scripts/test-h145010-measurement-runtime-pin.mjs` | 0 | 24 | 0 | 0 | 24 |
| `node --test --test-concurrency=1 server/scripts/test-pulse-private-read.js` | 0 | 27 | 0 | 0 | 27 |
| `node --test server/scripts/test-postgres-bin.mjs` | 0 | 7 | 0 | 0 | 7 |

Missing, pending, failure, and recovery cases in those runs passed. Observatory skipped the unconfigured historical capture and the live GET. Counts and names are in `RESULT.md`.

The host recomputation matched source `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82`, host `6fca4aaa8cd2332029be50506b5c414d8f7840c32d1cc1fd9c320671e9615abd`, 1323 members, 0 mismatches. The route bytes are not pin members. The human inventory is `6f3cb5cde8366402812394d549d592a3003168f51f274b901f153880d0f302a5`, 352 files, and `client/dist` equals the base tree `d5d35bdf311748ffbce6dec34579e1d708a98281`.

## Normal next-use command

Root runs `projectReleaseConsumerReadiness` from pilot `tools/ops/funded-continuation/release-consumer-readiness.mjs` at `eb99a41f5d5b0c1560fc8683ec0452dd1021a149` against the live graph. When that projection returns `enroll-source`, the command is:

```text
node <sdsRoot>/vendor/hosted-wallet-market/bin/installed-debt.mjs enroll --operation source-enroll-2fc7a9888654d617-6fca4aaa8cd23320
```

The separate read-only check is:

```text
node <sdsRoot>/vendor/hosted-wallet-market/bin/installed-debt.mjs enrollment
```

If the projection returns `recover-get`, Root uses the GET only and does not resend the POST. This receiver did not call a host. Inputs and the expected readback are in `enrollment-packet.json`.

## Next consumer and dependencies

Next consumer: Root. Root accepts and enrolls.

Dependencies:

- This SDS tree at `f4fba79fda839e8bfbad47b2b6883d8c2c9791a9`, including `vendor/hosted-wallet-market/src/native-debt.mjs` and `vendor/hosted-wallet-market/bin/installed-debt.mjs`.
- Pilot readiness file at `eb99a41f5d5b0c1560fc8683ec0452dd1021a149`, fetched by the GitHub API and not cloned into this tree.
- The proposed anchor and descriptor already in the subject tree.
- The approved catalog, left unchanged. Index `375ea0b83231b5e03d60fac2d5d9e892ed2bb2090b53846f93ec3d0e36754292`.
- A live graph and origin that this receiver did not read.
- The operator-stated 90-row environment and its `PULSE_TOKEN`, which a rollback must preserve. Do not replay snapshot `2afe45a622df4123442afc02b9e747db8bccda4cb505fe18889893ca63b59493`.

## Unknowns

- Live process route bytes, and whether that process loaded `server/index.js` or imported `server/app.js`.
- Whether f4 is installed. The route bytes are not pin members, so the host pin does not carry them. f4's route file does cover the fail-closed read.
- The live enrollment graph, including any non-200 enroll operation. Unknown is not zero.
- Health admission for the preserved consumer.
- The 90-row count and the token value. They are operator context, not a store read from this run.
