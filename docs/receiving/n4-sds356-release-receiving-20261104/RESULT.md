# N4-SDS356-RELEASE-RECEIVING

Independent receiving of PR356 head `f4fba79fda839e8bfbad47b2b6883d8c2c9791a9`. Tree `c5e12e30fec8f56806d69741f4c3eb3aef1adcc2`. Base `0593026ad155352f263e4749dc889a1578d91675`. Parent `2941e695ec518a2de881206932fb749806392473`. Source writer `bc-37fae84c` is finished. This record does not edit a PR356 file, does not enroll, and does not set qualified or Root receiving.

Machine record: `RESULT.json`. Enrollment inputs: `enrollment-packet.json`.

## Host pin

Recomputed with `vendor/hosted-wallet-market/src/native-debt.mjs` on this tree.

| Field | Value |
| --- | --- |
| Installed source | `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82` |
| Host | `6fca4aaa8cd2332029be50506b5c414d8f7840c32d1cc1fd9c320671e9615abd` |
| Pin members | 1323 |
| Pin mismatches | 0 |
| Installed source files | 125 |
| Pin schema | `sds.foundry.private-control-source.v1` |

The host pin is a separate identity from the human client inventory and from the loaded pulse route.

From base `0593026a`, two pin members differ besides the pin file itself: `package.json` (`e2af16586935e92dde2dbb39e6d192e9cc5e845b692e426962891be203a4b0a4`, 13591 bytes) and `vendor/hosted-wallet-market/SOURCE.json`. The only `SOURCE.json` field that differs is `installedSourceSha256`, now the measured source `2fc7a988…`. The previous recorded value was `458c129b2397099200be163ea6b11be61926114f9d6842897607cfcb9a771ba8`.

From parent `2941e695`, the only pin key that changes is `package.json`. The parent pin still records `64672f01d08f73f8915ddb473bca92a474195bdb5acffa49511d5eb3319e474e`, which does not match the parent `package.json` bytes. `hostSourceSha256` on that parent is `binding_stale`. f4 records the current `package.json` hash and the recomputation matches.

## Human client inventory

`node server/scripts/publish-preserved-client.mjs` exited 0.

```json
{"ok":true,"viteInvoked":false,"files":352,"bytes":59951737,"inventorySha256":"6f3cb5cde8366402812394d549d592a3003168f51f274b901f153880d0f302a5"}
```

`client/dist` at f4 and at base `0593026a` is the same git tree, `d5d35bdf311748ffbce6dec34579e1d708a98281`. The publisher did not invoke Vite and did not write `client/dist`.

## Pulse loaded route

The route bytes are not pin members.

| File | SHA-256 | Bytes | Pin member |
| --- | --- | --- | --- |
| `server/routes/pulse.js` | `15ee44563aa5d1ea6a2591788a2d9ca5bd9997d69e6c97de56462add6e060aff` | 1653 | no |
| `server/lib/pulse.js` | `fbaaa3cba57de74ecf78dcc6aa5b0c18bf90bd33ed0cada1f55b214cd3751b49` | 44952 | yes, agrees |
| `server/index.js` | `470c7efdfb3d5dc455dcb9235bf4fbef216ba2a9f35d4f0d30908c2149e91489` | 1913 | yes, agrees |
| `server/app.js` | `08e0abac1c823b4b619eb8e3dd11dc655f62c8923d52c7548cff1c3849ee7f63` | 11533 | yes, agrees |

Load chain: `server/index.js` imports `createSdsApp` from `server/app.js`. `server/app.js` imports `pulseRouter` from `./routes/pulse.js` and `pulseMiddleware` from `./lib/pulse.js`. It applies `pulseMiddleware` and mounts `pulseRouter` at `/api/pulse`.

`server/scripts/pulse-private-read.js` is the current consumer (`344e8b34a78dbf6bff0c0fb80c9eb60718de23f52cd2c62304c17ec1ba65f215`, 10245 bytes). It is also outside the pin, and it is separate from the loaded route.

f4's route covers the source-level fail-closed read. `configuredPulseToken()` returns null unless `PULSE_TOKEN` is a string whose trimmed length is at least 16. An unset, empty, or short token makes `GET /api/pulse` return 503 `{"error":"Pulse read unconfigured"}` with `Cache-Control: no-store`. A presented `k` that does not match returns 404. `POST /event` stays public. The f4 file contains neither `PULSE_TOKEN ||` nor `PULSE_TOKEN ??`. Base `0593026a` route `d6831f7c9b5c1e52d6f4d72be7633f414e15a4f97513b01a72c6dfddd734b3a6` still has the historical `PULSE_TOKEN ||` fallback. The live process was not read, so live coverage remains unknown. A matching host pin does not establish the route bytes, because those bytes are not pin members.

The pulse suite received that source behavior: `pulse aggregate reads fail closed unless PULSE_TOKEN is configured` and `pulse route source does not default PULSE_TOKEN` both passed.

## Proposed anchor and descriptor

`docs/receiving/h145010-useful-tool-measurement-20261104/proposed-anchor.json` hashes to `b48be38c0d398697997dd3184cb8bcf09652e08d0c24c4ad538d27cfa04eba77`. Schema `pilot.root10940.acquisition-trust-anchor.v1`. Its `requiredProfile` is the measured pair, money `unfunded`, participation `voluntary-artifact-v1`. It has no `receiving` key. `descriptorCommit` is `unreceived`.

`proposed-descriptor.json` hashes to `ce89812d7befe5f72d9de64fdf70c2471317a2c81a60a81f99790967d355a9f6`, matching the anchor. `publicationStatus` is `unreceived`. `hostedAcquisitionVerified`, `apiActivation`, `fundingOrPaymentActivation`, and `humanPage` are false.

The client `vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs` is 28081 bytes, SHA-256 `38d4e05cc757223f20e727fc75cf5a8bfe6d4e6dcaadd6cecdaff248422529d4`, matching the anchor. Source commit `e54f91e9d93f02cde6d2b281f0cc9b29ea87dfd9`.

## Why CI run 41909890197 exits 3

Run `41909890197` concluded failure on head `8a33717f4f09d9796e45704042e8df4190cf2ba2`, job `runtime-startup` (`126854331674`). That head is earlier than f4. Recomputed there, the installed source is still `2fc7a988…` and the host is `937a4c811ff72300f27cd1d7ca144894d07a2a3ef00e58553c5be9f2d2a6c53d`, with 1323 pin members. The approved catalog has no slot for `937a4c81` and no slot for f4's `6fca4aaa`.

The source-bound step on that run passed 24 tests, 0 failed, duration 64457.767169 ms. The next step, `Receive the independent acquisition packet`, runs `select-root10940-ci-packet.mjs` with `--legacy-env`. The selector exited 3:

```text
stale actual 2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82 expected 2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82
```

Exit 3 is the stale class. The message prints source hashes only. Catalog order puts `2fc7a988-8f8ce3b3…` first among verified rows, and that row's source equals the measured source, so both printed hashes match while the hosts differ. The legacy env packet on the run is the cafd slot: trust `71e88041…`, source `5901396f…`, host `1d75941a…`, also stale. The decoder did not run. The same selector at f4, with `ROOT10940_CI_PACKET` unset, also exits 3, writes no selected file, and records enrollment class `stale`, received false, measured host `6fca4aaa…`.

The approved catalog was left unchanged. Index SHA-256 remains `375ea0b83231b5e03d60fac2d5d9e892ed2bb2090b53846f93ec3d0e36754292`. Its three slots stay `ROOT57152` (cafd), `ROOT45466` (host `b7d8a722…`), and `ROOT62682` (host `8f8ce3b3…`). Each has qualified false and installed false.

## Disposable CI producer

The producer ran only on copies under `/tmp`. The committed catalog and index were not the write target.

Exact enrollment command, pointed at a disposable catalog and index, exited 1 with `index_receiving_required` and wrote nothing. The disposable tree stayed byte-identical to the committed catalog.

`--allow-unreceived` with a disposable catalog and no index exited 0 and would emit one slot:

`2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82-6fca4aaa8cd2332029be50506b5c414d8f7840c32d1cc1fd9c320671e9615abd.json`

Trust anchor `b48be38c0d398697997dd3184cb8bcf09652e08d0c24c4ad538d27cfa04eba77`. `received` false. The anchor inside that slot has no `receiving` key. The disposable index was unchanged. That slot was not copied into the repository and is not a Root receipt.

## Tests

Fresh checkout of f4, then `npm ci --no-audit --no-fund` (exit 0). Node v22.23.4, npm 10.9.9. PostgreSQL 16.15 at `/usr/lib/postgresql/16/bin`. PostgreSQL 17 is absent. The shell exported `PULSE_PG_BIN` and `AE14_PG_BIN` to that directory and `ROOT10940_CI_CATALOG` to the committed catalog. Two pulse tests still carry the historical title "real PostgreSQL 17"; they start the cluster through `PULSE_PG_BIN`, and they passed on 16.15.

| Command | Exit | Tests | Pass | Fail | Skipped |
| --- | --- | --- | --- | --- | --- |
| `npm run test:pulse` | 0 | 94 | 94 | 0 | 0 |
| pulse refusal, MCP outcomes, and browse contracts | 0 | 13 | 13 | 0 | 0 |
| `npm run test:original-task` | 0 | 14 | 14 | 0 | 0 |
| `contribution-delegation.test.mjs` | 0 | 4 | 4 | 0 | 0 |
| `handback-row-decision.test.mjs` | 0 | 1 | 1 | 0 | 0 |
| `test-h133010-accepted-work.mjs` | 0 | 2 | 2 | 0 | 0 |
| `test-capability-owner-lookup.js` | 0 | 10 | 10 | 0 | 0 |
| `npm run test:observatory` | 0 | 102 | 100 | 0 | 2 |
| `npm run test:result-reuse` | 0 | 37 | 37 | 0 | 0 |
| `test-h147010` and `test-h145010` together | 0 | 24 | 24 | 0 | 0 |
| `test-pulse-private-read.js` | 0 | 27 | 27 | 0 | 0 |
| `test-postgres-bin.mjs` | 0 | 7 | 7 | 0 | 0 |

Durations, in milliseconds: pulse 12028.604557, pulse contracts 3397.069514, original-task 11362.17786, contribution 6348.896574, handback 217.021291, h133010 12755.562941, capability 538.363894, observatory 1222.193393, result-reuse 927.795007, source-bound 39561.065034, private read 327.836184, postgres-bin 64.696293.

Missing, pending, failure, and recovery cases that passed:

- Private read: credential missing with no source and no request; credential missing when the token file path does not exist; CLI missing credential stays quiet; failure and recovery from a closed port to the live server; redirect refused; oversize response refused; direct consumer agrees with the CLI wrapper.
- Contribution: publication checker refuses missing consent; H-A handback and H-B delegation run on the disposable unfunded host.
- h133010: pending delivery is an assertion inside the passing opt-in test. The permit before acceptance returns `not_accepted`.
- Result reuse: failed extract stays exportable with failure codes; missing original evidence URL stays disclosed; CLI recovery produces a changed public capture once and then reuses it.
- Source-bound: a changed measurement file is `binding_stale` and the original bytes recover; the pending measurement candidate stays distinct from historical-only and received H142; missing, tampered, unreceived, wrong-source, and conflicting-index controls stay closed; a missing packet is refused; enrollment refuses without Root receiving.

Observatory skipped two optional tests: the historical capture is not configured, and `OBSERVATORY_LIVE` is not 1. No live observatory GET was sent.

These runs are source checks on this checkout. They are not independent outside use.

## Enrollment inputs for Root

The packet is `enrollment-packet.json`. Root alone accepts and enrolls. This receiver sets qualified false, Root receiving false, installed false, and received false.

Measured pair: source `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82`, host `6fca4aaa8cd2332029be50506b5c414d8f7840c32d1cc1fd9c320671e9615abd`.

The operation id comes from pilot `tools/ops/funded-continuation/release-consumer-readiness.mjs` at `eb99a41f5d5b0c1560fc8683ec0452dd1021a149` (blob `94fd7a44ad2bb4062bd6786efa36f74a2bae1681`). That file was fetched and was not cloned into this tree. `operationFor` is `source-enroll-` plus the first 16 hex characters of each hash:

`source-enroll-2fc7a9888654d617-6fca4aaa8cd23320`

When the live graph is readable, has no unknown enroll operation, and does not already contain this pair, the projection's next value is `enroll-source` with reason `binding_unenrolled`. The command is:

```text
node <sdsRoot>/vendor/hosted-wallet-market/bin/installed-debt.mjs enroll --operation source-enroll-2fc7a9888654d617-6fca4aaa8cd23320
```

POST `/api/neomorphic-contributor-journey/v1/native-debt/enroll`, body `{}`, resend false. The idempotency key is the operation id. The request hash of that empty body is `dadd73485b8b0bcf048444f8ec91fbac4acd7f81fab3d77c9b70db5bc06dc85a`. Environment names are `HOSTED_WALLET_MARKET_ORIGIN` and `CONTRIBUTOR_JOURNEY_OWNER_TOKEN`. `<sdsRoot>` must be a tree that measures as this pair.

The separate read-only check is:

```text
node <sdsRoot>/vendor/hosted-wallet-market/bin/installed-debt.mjs enrollment
```

GET `/api/neomorphic-contributor-journey/v1/native-debt/enrollment`. It writes nothing and does not resend the POST.

Expected GET view, derived from `readEnrollment`, and not observed on a host:

- When `assertBinding` passes, schema `pilot.root71.native-debt.enrollment.v1`, state `enrolled`, qualified true, and `sourceBinding` equal to the measured pair. The row's own `sourceSha256` and `hostSourceSha256` remain the originally inserted enrollment row. This receiver did not read that row. A succession enroll appends an edge and does not replace those columns.
- When the row is absent: state `absent`, qualified false, `boundConsumer` null.
- When a row exists and `assertBinding` fails: qualified false, and `sourceBinding` is absent.

This packet does not set qualified. The GET is the check that can. If the graph has exactly one non-200 enroll idempotency row for the request hash above, the projection's next value is `recover-get` on that stored key, and the POST is not resent. The live graph was not read, so that condition is unknown. Unknown is not zero.

## Rollback

The operator context for this receiving is a live environment of 90 rows, including a new `PULSE_TOKEN`. This receiver did not read Hostinger or the store. Any rollback keeps that token and those 90 rows. It does not replay the older 89-row snapshot `2afe45a622df4123442afc02b9e747db8bccda4cb505fe18889893ca63b59493`. Clearing `PULSE_TOKEN` on a source rollback to base `0593026a` would meet the historical fallback in that route. Keep the token set.

f4's route file covers the fail-closed read. The live process bytes are unknown, and the route bytes are not pin members.
