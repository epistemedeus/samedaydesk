# R2-DISTRIBUTION-06 RESULT — After-delivery continuation recipe

Date: 2026-09-10. Owner: Pilot Market Distribution R2 (`32d5b452`).

## Exact source / ref

- Repository: `epistemedeus/samedaydesk`
- Branch: `codex/r2-distribution-06-20260910`
- Pin: `2b80f38a4e5ec5f080d1764de7c539af63190012`
- Local commit (feature): `FEATURE_SHA_PLACEHOLDER`
- Worktree: `/workspace/pilot/worktrees/r2-distribution-06-20260910`
- Scope: `experiments/scale-r2-20260910/distribution/06`
- Remote: pushed `origin/codex/r2-distribution-06-20260910`

## Preflight

- Extended existing S124 / S131 / **S149** + DISTRIBUTION-01..05 evidence (INDEX pointers only)
- Did **not** Grexal/Agensi login; did **not** price / publish / review-submit; did **not** rebuild packages
- Authoritative Grexal state from S149: **PUBLIC_ACTIVE** listed; pricing Version1 `run_completed` 0.02 USD (estimate reserve 0.025 is NOT a charge); no customer execution/revenue/payout
- Agensi: Free PendingReview; 0 installs — not invented
- Useful job tied to real product: Grexal `samedaydesk-source-change-evidence` / `source_change_evidence_pack` (S124 package) after delivery
- Synthetic fixtures for tests; DEMO cites S149 marketplace surface without fake money or customer revenue
- `unavailable` kept distinct from `no_users`; opt-in required; broadcast forbidden
- Stop conditions honored: no invent buyers/revenue/payout; no unsolicited broadcast; no merge to default; no CloudAgent
- Did **not** wait on DIST-03 S149 amend (another worker owns that)

## Files

- `experiments/scale-r2-20260910/distribution/06/**` — build/validate kit, CLI, fixtures, tests, evidence INDEX, README
- `package.json` — `test:r2-distribution-06` (isolated)

## Tests (this VM)

- `npm run test:r2-distribution-06`: **15 pass / 0 fail**
  (positive source_change_evidence_pack + agensi_provenance_compare, negative broadcast/opt-in-false/generic-kind/malformed, partial blocked_missing_input, unavailable, no_users, unavailable≠no_users, validate rejects poisoned opt-in/broadcast, bare jobRef, command opt-in flags)
- `node .../src/cli.mjs demo`: available recipe for source_change_evidence_pack; Grexal S149 hints (0.02 pricing ≠ revenue); optIn=true broadcast=false; distinct unavailable/no_users

```sh
npm run test:r2-distribution-06
node experiments/scale-r2-20260910/distribution/06/src/cli.mjs demo
```

## Actual result

Delivered `buildContinuationRecipe` + `validateJob`/`validateRecipe`: bounded after-delivery continuation recipe `{ jobRef, afterDeliveryStep, reusePolicy: { optInRequired: true, broadcast: false }, commands[], marketplaceHints? }` tied to concrete useful job `source_change_evidence_pack` (S124 Grexal package) with S149 PUBLIC_ACTIVE marketplace hints; rejects `broadcast:true`, `optInRequired:false`, unsolicited broadcast fields, and generic `version_alert`; partial missing opt-in/jobRef → `blocked_missing_input`; capture outcomes `available|blocked_missing_input|unavailable|no_users` with unavailable omitting `priorDeliveryCount`.

## How invariants are enforced

- **opt-in required / no broadcast**: `reusePolicy.optInRequired` must be `true` (`FORBIDDEN_OPT_IN` on false); `broadcast` must be `false` (`FORBIDDEN_BROADCAST` on true); `FORBIDDEN_BROADCAST_FIELDS` (broadcastAudience, blastList, …) rejected anywhere; every command stamped `optInRequired:true` / `broadcast:false`; `assertOptInNoBroadcast`
- **useful job not generic**: `jobRef.kind` must be `source_change_evidence_pack` or `agensi_provenance_compare` with evidence/source path; `version_alert` → `FORBIDDEN_JOB_KIND`
- **unavailable ≠ no_users**: unavailable omits `priorDeliveryCount`; no_users sets it to 0; distinct codes; `assertCaptureDistinct` + collapsed-label reject

## Remaining unknowns / next

- Root owns Agensi PendingReview outcome and any Grexal customer execution/payout connection
- Live customer opt-in reuse events remain unobserved — do not invent
- DIST-03 S149 catalog amend owned by another worker
