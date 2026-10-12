# S275 earned-work — frozen design contract

Transparent contributor-first agent-effort marketplace kernel (prototype).
Pilot banked USDC is experiment budget, not profit. Reward 0.10 USDC is a
hypothesis with disclosed scope. Paying a contributor is expense, not revenue.

## Scope (only this directory)

Own: `services/earned-work/**`
Do not edit: homepage, other packs, `services/correspondence` sources, S276/S277,
payment-signature code, merchant extractors beyond read-only metadata reuse.

## Stack

Node 22 / TypeScript / Express 5 / `pg` / Zod — mirror `services/correspondence`
patterns (bearer grants, idempotency, postgres store, openapi, node:test).

## Interop draft v0 (do not silently diverge)

| Field | Rule |
| --- | --- |
| `taskId` | opaque string |
| `termsVersion` | content hash `sha256:` + 64 hex (F17 `hashTermsVersion`). `schemaVersion` is the integer shape version. `termsRevision` is the correction counter, not a public claim key |
| `reward` | `{ amount: string, asset: string, network: string }` — atomic decimal **string**, never float |
| `fundingState` | `unfunded \| reserved \| released` |
| `contributorPublicId` | public identifier; optional `payoutDestination` separate |
| reservation | one active reservation per task/version/credential (`contributor_token_id`); `public_id` is a label, not principal |
| submission | artifact `{ ref, digestSha256, mediaType, bytes }` — metadata only, **never execute** |
| `verdict` | append-only `pass \| fail \| needs_review`; accept binds an immutable verdict id (not newest `created_at`) |
| `payoutState` | `none \| owed \| queued \| submitted \| confirmed \| failed \| unknown` |
| obligation | typed adapter output + one idempotency key; **no transfer implementation** |
| fixtures | explicitly labelled `fixture` / `test` provenance |
| clocks | inject deterministic timestamps in tests; wall clock in real ops |

Machine-readable events: `discovery → claim → submit → accept → pay → repeat`
(compact append-only event log; not a broad analytics platform).

## HTTP surface (minimum)

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| GET | `/healthz` | none | store readiness |
| GET | `/v1/tasks` | public redacted | list open tasks (no secrets) |
| GET | `/v1/tasks/:taskId` | public redacted or owner | status plus A3 `workability` (`doNotStartWork`; mixedScore `displayOnly`; HTTP 200 is not `claimAuthority=agent`; unescrowed funds are not `escrowed`) |
| POST | `/v1/tasks` | owner | create task + terms + funding declaration; `provenance: test\|production` |
| POST | `/v1/tasks/:taskId/terms` | owner | new immutable termsVersion |
| POST | `/v1/tasks/:taskId/funding/reserve` | owner | `unfunded→reserved` when budget covers reward |
| POST | `/v1/tasks/:taskId/claims` | contributor | atomic claim; reject reserved elsewhere / expired / oversubscribed / integer `termsVersion` / mismatched hash |
| POST | `/v1/tasks/:taskId/submissions` | claimant | bound file-artifact metadata; reject late/duplicate/oversize/malformed |
| POST | `/v1/tasks/:taskId/verdicts` | owner or verifier hook | pass/fail/needs_review |
| POST | `/v1/tasks/:taskId/accept` | owner | acceptance → `payoutState=owed` + obligation record |
| POST | `/v1/tasks/:taskId/reject` | owner | rejection / correction with new termsVersion path |
| GET | `/v1/tasks/:taskId/obligation` | owner | typed obligation (no transfer) |
| GET | `/v1/tasks/:taskId/contributor-obligation` | contributor credential | exact readback `none` / `unknown` / `owed`; accepted is not owed |
| GET | `/v1/tasks/:taskId/payout` | owner | null/nonpaying reconciliation (`owed` ≠ paid ≠ settled) |
| GET | `/openapi.json` | none | OpenAPI 3 |

## Auth

- Owner: admin/owner bearer (correspondence-like hash-at-rest; env `EARNED_WORK_OWNER_TOKEN` for local).
- Contributor: scoped bearer issued at claim or via `POST /v1/contributor-tokens` (test helper).
- No deployment secrets required for local/docker fixture.

## Acceptance journey (must pass against real disposable Postgres)

`reserved → claimed → submitted → verified → owed` over real HTTP.
No fictional settlement. Adapter returns obligation only.

## Required tests

Concurrent two-client claim; reboot/persistence; late/duplicate submission;
changed terms; oversubscribed funding; replay identity / idempotency;
malformed/oversize input; redaction of public status.

## Fixture runner

`docker-compose.yml` for Postgres + `.env.example` + `scripts/pg-fixture.sh`
(local TCP Postgres also OK: `postgres://earned_work:earned_work@127.0.0.1:55432/earned_work_test`).

## Scripts

- `npm test` — node:test via tsx against disposable Postgres
- `npm run migrate`
- `scripts/pg-fixture.sh` — docker-compose or local initdb on :55432
- `scripts/curl-journey.sh` — full CLI curl path plus one seeded permission rejection
- `scripts/fixture-journey.sh` — start Postgres + HTTP, then the curl journey
- `scripts/opportunity.mjs` — import, claim, and readback for an opportunity round
- `scripts/opportunity-receive.mjs` — replayable fixture receive on an isolated schema
- `openapi.json` committed or generated in build
- `openapi-opportunity.json` — separate contract; do not fold it into the kernel path list

## Honesty

Portable lab packs are not a hosted exchange — wrap artifact/agreement semantics;
do not relabel fixture success as external completion. Token list price ≠ output value.

## Opportunity rounds (221400)

One configurable round shares this store and its idempotency table. Occupying claims (`reserved`, `submitted`, `accepted`, `owed`) consume the atomic cap. Expired unearned reservations release. Accepted rows do not. The round layer does not insert `earned_work_obligations` and does not call a payout rail. `owed` remains unpaid. Personal reservations are imported once; a later public claim with the same credential does not double-admit. Workflow offers that are not `publicClaimable` stay owner-assigned. Production admission is an explicit column, and a fixture credential cannot enter it.
