# R2-DISTRIBUTION-03 — Portable package catalog

Isolated experiment under `experiments/scale-r2-20260910/distribution/03` (repo: `epistemedeus/samedaydesk`).

## Outcome

Build **one source-linked manifest** of the reviewed new distribution packages (Grexal S124/S149 + Agensi S131) with:

- Actual install commands quoted from package READMEs
- `observed: true|false` for whether this VM lineage already ran them successfully per evidence
- Observed availability statuses that keep **`unavailable` ≠ `no_users`**
- Grexal **`active_public`** from authoritative S149 `PUBLIC_ACTIVE` receipt (exact agentId / deployment / pricing)
- Agensi **`pending_review`** / Free / installs=0 (no invented demand)
- Pointers at existing pins/paths — **no rebuild**, **no login**, **no publish/price/review-submit**

## Availability statuses

| Status | Meaning |
| --- | --- |
| `available_local` | Local package tree present; offline install/validate runnable |
| `draft_private` | Provider draft exists; private; **public listing not observed** |
| `active_public` | Provider **PUBLIC_ACTIVE** (authoritative receipt); priced public deployment |
| `pending_review` | Provider review pending; Root owns next event |
| `unavailable` | Provider/capture **unavailable** (no user count claimed) |
| `no_users` | Capture **succeeded**; users/installs/runs are **zero** |

## Fresh consumer

```sh
node experiments/scale-r2-20260910/distribution/03/src/cli.mjs demo
node experiments/scale-r2-20260910/distribution/03/src/cli.mjs build experiments/scale-r2-20260910/distribution/03/fixtures/inventory.positive.json
node experiments/scale-r2-20260910/distribution/03/src/cli.mjs validate /tmp/r2-dist-03-catalog.json
npm run test:r2-distribution-03
```

Demo writes `/tmp/r2-dist-03-catalog.json` and prints Grexal `active_public` (S149 agentId/deployment/pricing) + Agensi `pending_review` (Free, installs=0) with observed vs recommended-not-run command lists.

## Evidence

See `evidence/INDEX.md` (S149 receipt + S124 / S131 + DISTRIBUTION-01/02 RESULT pointers). Extends existing evidence; does not duplicate reporting.

## Mutation boundary

Feature-branch source/tests only. Root owns publication, price, visibility, PendingReview outcome, and merge to default. No CloudAgent. No Grexal/Agensi authenticated mutations from this kit. No customer execution/revenue/payout connection yet (`customerExecutionRevenuePayout=false`).
