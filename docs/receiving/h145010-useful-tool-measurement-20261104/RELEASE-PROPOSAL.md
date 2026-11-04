# H145010 release proposal

Machine-only. No merge, deploy, Hostinger install, production configuration, account, task, consent, message, spend, reset, or monitor is included.

## Output boundary

In this commit:

- `GET /api/tools/ai-readiness` records one terminal class on the existing pulse delta.
- Pulse schema version stays 2. `freeToolOutcomes` is optional. Empty deltas and RPC payloads omit it.
- `supabase/migrations/0010_pulse_free_tool_outcomes.sql` adds nullable `pulse_aggregate.free_tool_outcomes` and replaces validate, apply, and read. It does not replace `pulse_validate_mcp_outcomes`. It does not backfill. It does not add grants beyond restating `service_role` execute on apply and read.
- `server/scripts/test-free-tool-outcomes.js` and its entry on `npm run test:pulse`.
- This receiving note and `RESULT.md`.

Outside this commit:

- Client pages, `client/dist`, and other emitted human bytes.
- The `vendor/hosted-wallet-market` package bytes, `SOURCE.json`, and `server/scripts/h120010-promote.mjs`.
- The historical cafd packet, Root's received H142 slot, and the H147 proposal files for that older profile.
- Migrations `0005` and `0006`.
- MCP `check_ai_readiness`, `/scan`, funnel page views, seller-repair events, and the financial ledger.

## Host binding

The free-tool server and pulse files are now members of `server/foundry/activation/private-control-pin.json`. `pin.base` stays `4e24f9b5001aa5a527ca9ba3ecda98c97d4c7134`. The predecessor closure from `d3a9d82f0aed25b8f5dcef70096982ef93083810` stays in `receivedCallerClosures`.

Measured by `installedSourceSha256()` and `hostSourceSha256()`:

- repository `epistemedeus/samedaydesk`
- source `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82`
- current host pin `6fca4aaa8cd2332029be50506b5c414d8f7840c32d1cc1fd9c320671e9615abd`
- prior integration host pin `937a4c811ff72300f27cd1d7ca144894d07a2a3ef00e58553c5be9f2d2a6c53d`
- prior host pin `8f8ce3b387382df228a01b2caf7943d5e72840cd481264093b8897731e3fa654`

The current host pin changed because the `package.json` `test:result-reuse` script line is inside the private-control pin. `937a4c811ff72300f27cd1d7ca144894d07a2a3ef00e58553c5be9f2d2a6c53d` is the pin from the earlier observatory script line. `6fca4aaa8cd2332029be50506b5c414d8f7840c32d1cc1fd9c320671e9615abd` is unreceived, unqualified, and unenrolled. Enrollment belongs to Root. `server/routes/pulse.js` is not a pin member, so this host pin does not identify the pulse read route.

The source hash is the same vendor package the H142 candidate measured. The prior host pin is the joined pin from before that script line. H146's H142 binding remains source `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82` and host `b7d8a722279ce801cef8c7c807b16f534985def60b247c48de89d3495072d255`. That pair stays a valid received slot for its own candidate. It is a different runtime from this host. Neo's quote boundary is keyed only by source, so `2fc7a9888654d617b51f1268b3554abfdc1595c676d90a65d8450a311d920d82` still maps to `qualified_selection_required`. No new quote key is required. `vendor/hosted-wallet-market/SOURCE.json` previously held `458c129b2397099200be163ea6b11be61926114f9d6842897607cfcb9a771ba8`, which did not match the live installer, and was corrected.

## Proposed acquisition packet

Unreceived. It is not in `server/scripts/fixtures/root10940-approved-ci-packets/index.json` and it does not set `ROOT10940_CI_PACKET`.

- anchor `docs/receiving/h145010-useful-tool-measurement-20261104/proposed-anchor.json`, 925 bytes, sha256 `0e740074bdf6f7178b42cff4f92934e05cc1d543131cefc627eabe88017bd46b`
- descriptor `docs/receiving/h145010-useful-tool-measurement-20261104/proposed-descriptor.json`, 890 bytes, sha256 `2066f94ad3bf555bf5fe46314aad7f4827d5580dac3ca14b4942529781d991c2`
- enrollment `docs/receiving/h145010-useful-tool-measurement-20261104/ENROLLMENT.json`, 42556 bytes, sha256 `3b1d61eb5d7fcc64ddaaa1030cdd27dfb38ba0f7fdf26573f82ada9ba00fde8a`
- client sha256 `38d4e05cc757223f20e727fc75cf5a8bfe6d4e6dcaadd6cecdaff248422529d4`, 28081 bytes, version 0.3.0
- measured base recorded on the enrollment is the integration parent `d3a9d82f0aed25b8f5dcef70096982ef93083810`. The host fingerprint above is the successor tree that contains this pin. Root's receiving `candidateCommit` is the pushed head of this branch.

The producer and selector enrollment command points at this proposal. The historical cafd slot and the received H142 slot stay in the catalog. The workflow receive step stays red until Root enrolls this host. It does not rewrite `vars.ROOT10940_CI_PACKET`.

## Publisher

`server/scripts/h120010-promote.mjs` packages only `vendor/hosted-wallet-market` under release contract `sds.h120010.release-contract.v1`. This measurement does not change that package or the H142 publication correction. That publisher was not run.

`server/scripts/publish-preserved-client.mjs` checked the existing `client/dist` and did not run Vite:

`{"ok":true,"viteInvoked":false,"files":352,"bytes":59951737,"inventorySha256":"6f3cb5cde8366402812394d549d592a3003168f51f274b901f153880d0f302a5"}`

## Rollout

1. Root installed exact migration0010 at 2026-11-04T03:54:40Z. Preserve that journal and the nullable history. Do not replay it for this server release.
2. Deploy the server commit that emits `freeToolOutcomes` only after that migration is in place. A new delta flushed at an old database fails closed into the existing WAL and backoff. The checker HTTP response still returns.
3. Do not backfill. Counts start at `freeTool.observedFrom`.

## Readback

Token-gated `GET /api/pulse`. Use `freeTool`:

- `coverage: "unknown"` and null counts mean unobserved, including every check before the first instrumented process.
- `coverage: "lower_bound_from_first_observation"` with `requests`, `outcomes`, and `callers` is the lower bound from `observedFrom`.
- `reportedAcquisition` is `not_stored_here`. Page-view acquisition remains `funnel.tools` and `byReferer`.
- `completed` is a finished check. It is not a citation, rank, paid audit, customer, or revenue event.

## Rollback

Keep migration 0010 installed if any WAL row or aggregate cell contains `freeToolOutcomes`. Before an old-reader rollback, drain complete pending WAL rows through the capable new consumer and receive their acknowledgements. A row can mix prior counters and free-tool outcomes, so never discard a mixed or unknown row. If safe drain cannot be established, keep the new reader and use a forward repair. Do not drop `free_tool_outcomes` while a new producer is still running. Ordinary deltas that omit the key remain valid on the previous validator.
