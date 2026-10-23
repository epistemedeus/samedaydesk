ROOT4433 / R4-J02, October 23, 2026. Source experiment for future EOA bindings. The admitted branch is `codex/root4433-future-wallet-binding-20261023`, origin `https://github.com/epistemedeus/samedaydesk.git`, product base `79fbd37d31aabdc790248443c576a2f0017e55f0` (tree `9e7c8c1bb1f513841117d9d7d3bd5ef49839f501`). No other package's implementation files were changed.

The implementation requires the existing current machine capability, current account session, exact Origin and CSRF, and separate old/replacement EOA signatures. Both messages bind one server-issued intent containing origin, tenant, account, network, both addresses, predecessor epoch, operation key, random nonce, five-minute expiry and source/capability identity. Only read-only configured RPC checks are used to reject unsupported contract/7702 wallets. Missing old control is an explicit hold; account/password recovery supplies no replacement authority.

The existing `earned_work_idempotency` journal stores the intent and result. The existing transaction updates the future address, increments the epoch and clears old control proof/challenge fields with its operation receipt. Account/session/delivery locks serialize native recovery; a final session check also rolls back an operation whose RPC reads outlast account expiry. Subsequent control uses the unchanged machine `walletChallenge`/`walletProve` path. There is no new account, wallet rail, nonce allocator, budget or financial ledger. No 011 migration is needed or exported; existing 006–010 columns suffice and the receiver checks exact schema equality.

All paths below are relative to `/api/neomorphic-contributor-journey`, with the existing `x-ae-wire-version: c0-1` header.

| Request | Input/result |
| --- | --- |
| `POST /v1/wallet/continuation/challenge` | Authenticated write headers plus an idempotency key; `{address}` with optional `scheme: "eoa-personal-sign"`. Returns `intent`, `challengeDigest`, `oldMessage`, `newMessage`. Issuing a challenge changes no wallet binding. |
| `POST /v1/wallet/continuation/commit` | A distinct idempotency key and `{challengeKey, challengeDigest, oldSignature, newSignature}`. Sign each returned role-specific message with its corresponding owner-side EOA. No key is sent to the server. |
| `GET /v1/operations?idempotencyKey=...` | Existing authenticated readback. Reconcile the original key after a lost response. Identical key/route/body returns the recorded result; changed input refuses. |
| `POST /v1/market/walletChallenge`, then `walletProve` | Existing current-binding proof for future work after commit. Old proofs cannot regain authority, including after restoring a previously used address. |

Actual disposable receiving uses `createSdsApp`, verified HTTPS, verified-full TLS PostgreSQL, random in-process EOA keys and a loopback read-only RPC fixture. The final HTTP/PG run passes 20 tests, including wrong signatures and bound fields, account recovery, session expiry during RPC, smart-wallet holds at issue and commit, disabled/stale/successor source, concurrent replacements, three real HTTP-process crash boundaries, lost response, restart, and PostgreSQL immediate-stop/WAL recovery. It receives the unchanged old machine quote/party terms, accepted artifact bytes, original destinations, fixed net, exact 5% gross fee, old grants/kernel bindings, owed row, nonpayable already-paid disposition and synthetic uncertain operation identity. Snapshots compare the original financial rows exactly. The uncertain operation is synthetic journal state; no funded rail broadcast/capture or rail crash test is claimed.

The main positive old-result consumer uses its existing legacy-issued session. A separate pre-existing machine-session retained-reader failure remains outside this writer's scope. Exact unmodified source reproduces it: see [ROOT-SHARED-PORT.md](ROOT-SHARED-PORT.md). Native machine sessions do successfully complete dual-control binding, including after native password recovery, but the existing retained reader's hash mismatch prevents claiming their old-result journey complete. Root must resolve that small shared reader boundary before promoting the broader native-session consumer claim.

| Evidence | Actual result |
| --- | --- |
| [00 prerequisite](00-baseline-prerequisite.log) | First failure retained: missing `viem`. Existing lockfile install added 170 packages; no lockfile edit. |
| [08 original HTTP/PG](08-baseline-http-pg.log) | 2/2. Original different-address bind refuses; exit retains address; unsupported route falls through to the contributor CSRF guard with 403. This is an unsupported continuation, not a theft incident. |
| [15 original retained boundary](15-original-retained-session-boundary.log) | 5/5 baseline assertions. Exact original package SHA `5b7d3d5e2179d55af1d5b69d0f5ce3c5217ca3ebfa77b80e43792acaf00b42e5`, host SHA `717718ddb9f9bca03afa4f5a05b6add5a8670e83b803a32b249b5f4fb2917215`; legacy result success and native hash-mismatch 401 are both received. |
| [19 final HTTP/PG](19-final-http-pg-with-native-reserve.log) | 20/20, zero skips/failures. Includes native supervisor/process RSS in the measured total; see RECEIPT.json for peak. |
| [18 required regressions](18-account-profile-regressions.log) | 9/9 actual tests in `account-delivery.test.mjs` and `machine-profile-receiving.test.mjs`, plus their candidate preparation wrapper. |

The first failures and ordinary fixture corrections are preserved in [ATTEMPTS.md](ATTEMPTS.md), not replaced with later successes. Self-review also added the account-expiry recheck and verified that no old quote, grant, payout, debt or operation is written by the continuation module. All source/PG/tests run serially under the admitted 2,097,152 KiB total, zero-model-child profile. The native identity and declared xhigh profile come from this operation's SPEC/RUN receipts; no additional model was invoked.

Next-use commands from the admitted checkout (PostgreSQL 16 binaries and their loader libraries must already be available):

```bash
NODE_OPTIONS=--max-old-space-size=384 npm ci --ignore-scripts --no-audit --no-fund
export AE14_PG_BIN=/path/to/postgresql/16/bin
export LD_LIBRARY_PATH=/path/to/its/loader/libraries
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 server/scripts/test-r4-wallet-continuation.mjs
R4_WALLET_REGRESSION=1 NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 server/scripts/test-r4-wallet-continuation.mjs
R4_WALLET_HISTORY_BASELINE=1 NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 server/scripts/test-r4-wallet-continuation.mjs
```

Optional `R4_WALLET_OWNER_PIDS` adds only the verified owning native supervisor/process IDs to RSS accounting. The receiver copies an isolated candidate, uses the existing `refresh-installed-receiving-source.mjs` generator there, and removes it and all owned HTTP/PG fixtures. The admitted checkout's shared `SOURCE.json`, machine runtime contract, private control pin, manifests and locks stay unchanged. Direct profile tests against intentionally unrefreshed shared pins are not canonical receiving; use the candidate wrapper until Root composes and regenerates the combined closure.

Root owns integration, the shared reader amendment, canonical source/artifact receiving, and any later installation. No live signing, RPC mutation, payment, wallet enrollment, customer contact, provider setting, deployment, upstream PR or human asset was performed. Source success establishes neither installation nor outside usefulness or revenue. The actual SPEC checkpoint is `2026-10-23T13:31:23.085Z`, horizon `2026-10-23T13:46:23.085Z`; this source export finishes before both.
