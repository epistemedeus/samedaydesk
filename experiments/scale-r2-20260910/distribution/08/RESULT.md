# R2-DISTRIBUTION-08 RESULT — Distribution conversion diagnosis

Date: 2026-09-10. Owner: Pilot Market Distribution R2 (`32d5b452`).

## Exact source / ref

- Repository: `epistemedeus/samedaydesk`
- Branch: `codex/r2-distribution-08-20260910`
- Pin: `2b80f38a4e5ec5f080d1764de7c539af63190012`
- Local commit (feature): `a1b0ac5ebaef9a7aadef9d058f3fcc94d0e9b0bf`
- Worktree: `/workspace/pilot/worktrees/r2-distribution-08-20260910`
- Scope: `experiments/scale-r2-20260910/distribution/08`
- Remote: pushed `origin/codex/r2-distribution-08-20260910`

## Preflight

- Extended existing S124 / S131 / **S149** + DISTRIBUTION-03..07 evidence (INDEX pointers only)
- Did **not** Grexal/Agensi login; did **not** price / publish / review-submit; did **not** rebuild packages
- Authoritative Grexal state from S149: **PUBLIC_ACTIVE** listed; pricing Version1 `run_completed` 0.02 USD (estimate reserve 0.025 is NOT a charge); no customer execution/revenue/payout
- Agensi: Free PendingReview; 0 installs — not invented
- Synthetic fixtures for DIST-04/05-shaped join bundles; DEMO cites S149 without fake conversion or customer revenue
- `unavailable` kept distinct from `no_users`
- Stop conditions honored: no invent buyers/clicks-as-intent/revenue/payout; no merge to default; no CloudAgent
- Completes DISTRIBUTION-01..08 set

## Files

- `experiments/scale-r2-20260910/distribution/08/**` — diagnose/validate kit, CLI, fixtures, tests, evidence INDEX, README
- `package.json` — `test:r2-distribution-08` (isolated)

## Tests (this VM)

- `npm run test:r2-distribution-08`: **14 pass / 0 fail**
  (positive compatible join with unknowns; causation-known via sharedEvidenceId; negative incompatible unjoined; invented revenue/intent reject; partial; unavailable; no_users; unavailable≠no_users; click≠conversion; no invented revenue; validate rejects smuggled conversion claim / collapsed labels)
- `node .../src/cli.mjs demo`: available join with causationKnown=false + unknowns[]; incompatible→unjoined; Grexal S149 0.02 ≠ revenue; distinct unavailable/no_users

```sh
npm run test:r2-distribution-08
node experiments/scale-r2-20260910/distribution/08/src/cli.mjs demo
```

## Actual result

Delivered `diagnoseConversion` + `validateBundle`/`validateDiagnosis`: joins only source-compatible `acquisitionEvidence` ↔ `usefulOutputEvidence` pairs; incompatible → `unjoined` with reason; per join `{ causationKnown, customerIndependenceKnown, unknowns[] }` with causation/independence **false by default** unless matching `sharedEvidenceId` / `independentCustomerRef`; rejects invented revenue / buyerIntent; statuses `available|partial|unavailable|no_users` with unavailable omitting counts.

## How unknowns / causation are expressed

- **causationKnown**: `true` only when both sides share non-empty `sharedEvidenceId`; else `false` and `unknowns` includes `"causation: no sharedEvidenceId proving acquisition caused this useful output"`
- **customerIndependenceKnown**: `true` only when matching `independentCustomerRef`; else `false` and unknowns list independence gap
- **conversion/revenue**: every join sets `claims.conversionFromClick=false`, `claims.revenueFromListPrice=false`; unknowns call out click≠conversion and list-price≠earnings (S149)
- **unavailable ≠ no_users**: unavailable omits `activationCount`/`usefulOutputActionableCount`; no_users sets them to observed zeros

## Remaining unknowns / next

- Root owns Agensi PendingReview outcome and any Grexal customer execution/payout connection
- Live customer conversion and independence remain unobserved — do not invent
- No CloudAgent; no Grexal/Agensi login in this task
- DISTRIBUTION-01..08 package set complete
