# earned-work (S275 prototype)

Local HTTP + Postgres kernel for a contributor-first agent-effort marketplace.

This is **not** a hosted exchange. Portable lab packs remain lab packs. A passing fixture journey is not external completion. Reward `0.10 USDC` is a disclosed hypothesis, not profit and not a chain transfer. The default payout adapter is **null / nonpaying**. `payoutState=owed` is an IOU record. Artifact `ref` values are metadata; they are never fetched or executed.

Provenance is explicit on every task and contributor token: `test` | `fixture` | `production`. Never `actual_completion`.

## Run (disposable Postgres)

```bash
./scripts/pg-fixture.sh
export EARNED_WORK_DATABASE_URL=postgres://earned_work:earned_work@127.0.0.1:55432/earned_work_test
export EARNED_WORK_OWNER_TOKEN=dev-owner-token-s275

npm ci
npm run build
npm test
npm start   # 127.0.0.1:8791 (set EARNED_WORK_LISTEN_HOST=0.0.0.0 to bind all interfaces)
./scripts/curl-journey.sh
```

Or one fixture process:

```bash
./scripts/fixture-journey.sh
```

`pg-fixture.sh` uses an already-reachable URL, otherwise docker-compose tmpfs Postgres, otherwise a local `initdb` cluster on port 55432.

## HTTP surface

See `DESIGN.md` and `openapi.json`. Owner bearer for create/reserve/verdict/accept/obligation/payout; scoped contributor bearer for claim/submit. `GET /v1/tasks/:taskId/payout` reconciles the null/nonpaying adapter (`owed` ≠ paid ≠ settled).

## Opportunity rounds

`openapi-opportunity.json` documents a sibling claim path on the same Postgres store. A round has one atomic cap, fixed terms, and idempotent import/claim/submit/accept. Closed, full, and mismatched requests return a next task or a waitlist (`paidSlot: false`, `doNotStartWork: true`). Acceptance records an owed IOU on `null_nonpaying_v0` and does not mint a kernel obligation or transfer funds. Fixture files are not production admission.

```bash
node --import tsx scripts/opportunity-receive.mjs
node scripts/opportunity.mjs --help
```

See `RUNBOOK-opportunity-221400.md`.

## Honesty

- `payoutState=owed` is an obligation record, not a chain transfer.
- Default verifier checks digest / media type / byte bounds only. That pass is not a reproduction of arbitrary external work. Reproduction verification is an explicit `EARNED_WORK_VERIFIER=reproduction` injection: POST `/submissions` must include bounded `evidenceBase64`, the kernel stores those received bytes, and the host-controlled E18 child evaluates that copy. A known digest or fixture catalog is not a submission. `artifact.ref` is never fetched or executed.
- Public `GET /v1/tasks` is redacted (no tokens, no payout destinations, no budget internals).
- Reuses `services/correspondence` patterns and wraps `packs/exchange-townsquare` artifact/agreement semantics. Does not copy `packs/earned-work-verification` or Wave 1 sibling directories.
