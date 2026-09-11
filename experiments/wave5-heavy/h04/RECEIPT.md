# RECEIPT — W5-H04 useful-job benchmark

| Field | Value |
| --- | --- |
| Repo | `epistemedeus/samedaydesk` |
| Branch | `codex/w5-h04-20260911` |
| Owned path | `experiments/wave5-heavy/h04/` only |
| Native model | `grok-4.6-build` |
| Parent session | `03efef00-6fd3-4435-b2d1-1b32a46661b8` |
| Child count chosen | **9** (6 immediate + 3 expand; RAM/disk reserve held) |
| Pilot pin | `95b3f3a47f5b1b69bd237e4c978fc3376221365d` |

## Child session ids

1. `01a092a7-d4c2-7a50-9d2e-22e50b96ee28` — inventory SDS52 + W4 pins
2. `01a092a7-d4c2-7a50-9d2e-22f658709c06` — schema/webhook pairs
3. `01a092a7-d4c2-7a50-9d2e-2301a3063ddd` — lockfile pairs
4. `01a092a7-d4c2-7a50-9d2e-231a8f91bae8` — API route pairs
5. `01a092a7-d4c2-7a50-9d2e-232b8c742e84` — page-fact pairs
6. `01a092a7-d4c2-7a50-9d2e-233b92369d9f` — harness + engine smoke
7. `01a092b3-0d0c-7702-9cbb-e552273db7fc` — offer candidates + evidence bind
8. `01a092b3-0d0c-7702-9cbb-e56b82beb1f8` — extra tests + SDS52 OpenAPI run
9. `01a092b3-0d0c-7702-9cbb-e57ac61fd344` — persist child engine artifacts into `runs/`

## RAM / disk vs reserve

Host ~16 GiB RAM, ~10 GiB available during 9-child fan-out (~62% free; reserve target ~25%). Disk ~4% used of 254 G (~244 G free; reserve target ~20%). No extra children 10–18: remaining work was integration, RECEIPT, PR.

## Engines actually executed

| Engine | SHA |
| --- | --- |
| SDS52 paid-useful-jobs | `aeef964fa188443078958d9d6d393afae1d542ee` |
| W4 json-schema-webhook-drift | `94c7bfdfeaa99f5e70f341504df3051cc7717f91` |
| W4 lockfile-pin-delta | `e81efc8ab71b1bde88eca743d297149e61bbb6f2` |
| W4 route-table-diff | `7387eb677abd442dfab9081cb0ad95451fd2a762` |
| W4 page-change-offline-job | `91b57334818ecd7940cb854e9864f3b1749d1d1d` |

useful-jobs archive sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` / 2522418 bytes (re-hashed). Worktrees under `/tmp/w5-h04/ro-*` (read-only).

## Tests / coverage

`cd experiments/wave5-heavy/h04 && npm test` → **17 pass, 0 fail** (`node:test`). Catalog `run`: **12 examples, 12 match**. Smoke recorded under `runs/engine-smoke/` (SAMPLE not a customer job).

## Strongest offer candidates

1. **h04-lock-01** — `concurrently`/`qs`/`shell-quote` version+integrity bumps; operator must not `npm ci` as if pins were unchanged.
2. **h04-schema-01** — JSON Schema `exclusiveMinimum` boolean→number; boolean emitters break.
3. **h04-page-03** — `/x402/verified` inspection criterion becomes 7-day CDP Bazaar freshness; same SHAs as a route no-change control.

## Exact failures observed

- Page `--example` refuses `sample_as_delivered_watch` (designed). Journey analog succeeds.
- W4-commerce-11 and W4-commerce-13 GitHub PR numbers: **unknown** (compare URLs only).
- Engine no-change token is `informational` (schema/lock) vs page `unchanged` vs route-diff no `status` key. Harness aliases for compare; strings still differ (`offers/VOCABULARY-GAPS.md`).
- Full SDS lockfile self-diff is `partial` because `vendor/neomorphic-correspondence` lacks integrity; lock-03 uses a 159-pin subset.

## Useful findings + next owner

SDS52 `api-upgrade-brief` on caller OpenAPI (`h04-route-02`) is `actionable`, `sold=false`, `fundingState=unfunded`, +3 used ops (`consider-adoption`). W4 engines produce decision-changing briefs on real public/SDS revision pairs without copying M06–M09 corpora.

**Next owner:** W5-D01 / Root — bind these twelve jobs into the SDS52 supplied-input contract if an offer is published. Do not treat SAMPLE smoke as a sale. Do not merge to production from this receipt.

## PR / compare

| Field | Value |
| --- | --- |
| Head | `3a96c8db0ce21ce9059f76da91019c17138b9567` (RECEIPT-stamp commit follows) |
| Draft PR | `gh pr create` GraphQL **Resource not accessible by integration** |
| Compare | https://github.com/epistemedeus/samedaydesk/compare/main...codex/w5-h04-20260911 |
