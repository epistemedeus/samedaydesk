# R2-DISTRIBUTION-05 RESULT — Marketplace readback collector

Date: 2026-09-10. Owner: Pilot Market Distribution R2 (`32d5b452`).

## Exact source / ref

- Repository: `epistemedeus/samedaydesk`
- Branch: `codex/r2-distribution-05-20260910`
- Pin: `2b80f38a4e5ec5f080d1764de7c539af63190012`
- Local commit (feature): `TIP_PENDING`
- Worktree: `/workspace/pilot/worktrees/r2-distribution-05-20260910`
- Scope: `experiments/scale-r2-20260910/distribution/05`
- Remote: pushed `origin/codex/r2-distribution-05-20260910`

## Preflight

- Extended existing S124 / S131 / **S149** + DISTRIBUTION-01..04 evidence (INDEX pointers only)
- Did **not** Grexal/Agensi login; did **not** price / publish / review-submit; did **not** rebuild packages
- Authoritative Grexal state from S149: **PUBLIC_ACTIVE** listed; pricing Version1 `run_completed` 0.02 USD (estimate reserve 0.025 is NOT a charge); no customer execution/revenue/payout
- Agensi: Free PendingReview; 0 installs — not invented
- Synthetic fixtures for tests; DEMO cites S149/S124/S131 without fake money
- `unavailable` kept distinct from `no_users`; list pricing kept distinct from earnings
- Stop conditions honored: no invent buyers/revenue/payout; no merge to default; no CloudAgent

## Files

- `experiments/scale-r2-20260910/distribution/05/**` — collect/validate kit, CLI, fixtures, tests, evidence INDEX, README
- `package.json` — `test:r2-distribution-05` (isolated)

## Tests (this VM)

- `npm run test:r2-distribution-05`: **15 pass / 0 fail**
  (positive listed+pricing+runs, negative other-marketplace/synthetic-earnings/no-ref/malformed, partial, unavailable, no_users, unavailable≠no_users, pricing≠earnings, providers, observed-earnings pass-through)
- `node .../src/cli.mjs demo`: Grexal listed + run_completed 0.02 pricingObserved; earnings unavailable; Agensi reviewed; distinct unavailable/no_users

```sh
npm run test:r2-distribution-05
node experiments/scale-r2-20260910/distribution/05/src/cli.mjs demo
```

## Actual result

Delivered `collectReadback` + `validateEvents`/`validateSummary`: Grexal+Agensi-only marketplace event kinds (`draft|listed|reviewed|install|run|earnings`); privacy-bounded summary with counts, lastObserved, `pricingObserved` (S149 0.02 list price ≠ earnings), earnings amounts only when cited (else `unavailable`); rejects other marketplaces and synthetic/invented earnings; capture outcomes `recorded|partial|unavailable|no_users` with unavailable omitting installCount/runCount.

## How invariants are enforced

- **no synthetic revenue**: `synthetic:true` on earnings and earnings without `evidenceRef` rejected (`FORBIDDEN_SYNTHETIC_REVENUE`); unavailable earnings must not carry amounts or `zeroRevenueClaim`; S149 `run_completed` 0.02 lives in `pricingObserved`, not `earnings.amounts`
- **unavailable ≠ no_users**: unavailable omits `installCount`/`runCount`; no_users sets both to 0; distinct codes; `assertCaptureDistinct` + collapsed-label reject

## Remaining unknowns / next

- Root owns Agensi PendingReview outcome and any Grexal customer execution/payout connection
- Live customer installs/runs/earnings remain unobserved — do not invent
