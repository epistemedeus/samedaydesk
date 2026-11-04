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
- `vendor/hosted-wallet-market`, the H142 pin, and `server/scripts/h120010-promote.mjs`.
- Migrations `0005` and `0006`.
- MCP `check_ai_readiness`, `/scan`, funnel page views, seller-repair events, and the financial ledger.

## Publisher

`server/scripts/h120010-promote.mjs` packages only `vendor/hosted-wallet-market` under release contract `sds.h120010.release-contract.v1`. This measurement does not change that tree or the H142 publication correction. The existing publisher is not required and was not run.

## Rollout

1. Apply `supabase/migrations/0010_pulse_free_tool_outcomes.sql` on the pulse database.
2. Deploy the server commit that emits `freeToolOutcomes` only after that migration is in place. A new delta flushed at an old database fails closed into the existing WAL and backoff. The checker HTTP response still returns.
3. Do not backfill. Counts start at `freeTool.observedFrom`.

## Readback

Token-gated `GET /api/pulse`. Use `freeTool`:

- `coverage: "unknown"` and null counts mean unobserved, including every check before the first instrumented process.
- `coverage: "lower_bound_from_first_observation"` with `requests`, `outcomes`, and `callers` is the lower bound from `observedFrom`.
- `reportedAcquisition` is `not_stored_here`. Page-view acquisition remains `funnel.tools` and `byReferer`.
- `completed` is a finished check. It is not a citation, rank, paid audit, customer, or revenue event.

## Rollback

Keep migration 0010 installed if any WAL row or aggregate cell contains `freeToolOutcomes`. Drain or discard only pending free-tool WAL entries before rolling the server back to a build that cannot read the key. Do not drop `free_tool_outcomes` while a new producer is still running. Ordinary deltas that omit the key remain valid on the previous validator.
