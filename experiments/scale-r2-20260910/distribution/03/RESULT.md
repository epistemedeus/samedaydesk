# R2-DISTRIBUTION-03 RESULT — Portable package catalog (S149 amend)

Date: 2026-09-10. Owner: Pilot Market Distribution R2 (`32d5b452`). Amend: DIST-03+ → `active_public` from S149.

## Exact source / ref

- Repository: `epistemedeus/samedaydesk`
- Branch: `codex/r2-distribution-03-20260910`
- Pin (base): `2b80f38a4e5ec5f080d1764de7c539af63190012`
- Local tip (feature): 
- Worktree: `/workspace/pilot/worktrees/r2-distribution-03-20260910`
- Scope: `experiments/scale-r2-20260910/distribution/03`
- Remote: `origin/codex/r2-distribution-03-20260910`
- Authoritative receipt: `/workspace/pilot/receipts/scale-bot-0909/r2-team/receipts-grexal-s149.json`

## Preflight / amend truth

- Grexal availability amended from `draft_private` → **`active_public`** per S149 `PUBLIC_ACTIVE`
- Exact fields: agentId `j970cajvv6wbrmy64s2f4ajzw18e5j2q`, deploymentId `j570f14047dzpkhc0trh3fnp8s8e43sd`, deploymentVersion `v1`, pricing `run_completed_usd=0.02` / `estimate_reserve_usd=0.025` / `estimateReserveIsCharge=false`, category `developer-tools`, tags `code,diff,evidence,validation`, homepage `samedaydesk.com`
- `customerExecutionRevenuePayout=false` — **no customer execution/revenue/payout connection yet**
- Agensi stays **`pending_review`** / Free / **installs=0** (no invented demand)
- `unavailable` kept distinct from `no_users`; `active_public` added to status enum + validate
- Did **not** rebuild Grexal/Agensi; did **not** login / price / publish / review-submit; no CloudAgent

## Files

- `experiments/scale-r2-20260910/distribution/03/**` — constants/catalog/validate/CLI/fixtures/tests/README/evidence INDEX/RESULT
- `package.json` — `test:r2-distribution-03` (unchanged script)

## Tests (this VM)

- `npm run test:r2-distribution-03`: **9 pass / 0 fail**
  (positive Grexal active_public+S149 fields + Agensi pending_review, active_public validate required fields, negative/forbidden, partial, unavailable, no_users, unavailable≠no_users, collapsed reject, required statuses incl. active_public)
- `node .../src/cli.mjs demo`: ready + active_public (exact S149) / pending_review Free installs=0 + distinct unavailable/no_users

```sh
npm run test:r2-distribution-03
node experiments/scale-r2-20260910/distribution/03/src/cli.mjs demo
```

## Actual result

Amended portable catalog so Grexal uses `active_public` with exact S149 PUBLIC_ACTIVE agentId/deployment/pricing/category/tags/homepage; evidenceRefs cite `receipts/scale-bot-0909/r2-team/receipts-grexal-s149.json`. Agensi remains pending_review Free installs=0.

## Cross-kit note (non-blocking)

DIST-04 fixtures still hardcode Grexal catalog availability as `draft_private` (`entries.positive.json` / evidence INDEX). Consistency amend is owned elsewhere — **not blocking** this DIST-03 catalog amend. DIST-05 not in scope.

## Remaining unknowns / next

- Customer execution/revenue/payout still disconnected (`customerExecutionRevenuePayout=false`)
- Agensi PendingReview outcome still Root-owned; installs remain 0
- Optional DIST-04 fixture sync to `active_public` when that worker amends
