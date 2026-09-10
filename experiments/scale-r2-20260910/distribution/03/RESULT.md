# R2-DISTRIBUTION-03 RESULT — Portable package catalog

Date: 2026-09-10. Owner: Pilot Market Distribution R2 (`32d5b452`).

## Exact source / ref

- Repository: `epistemedeus/samedaydesk`
- Branch: `codex/r2-distribution-03-20260910`
- Pin: `2b80f38a4e5ec5f080d1764de7c539af63190012`
- Local commit (feature): `2fe561799e2a7872984de5f68ff61f78083a0490`
- Worktree: `/workspace/pilot/worktrees/r2-distribution-03-20260910`
- Scope: `experiments/scale-r2-20260910/distribution/03`
- Remote: pushed `origin/codex/r2-distribution-03-20260910`

## Preflight

- Extended existing S124 / S131 + DISTRIBUTION-01/02 evidence (INDEX pointers only)
- Did **not** rebuild Grexal/Agensi packages; did **not** login / price / publish / review-submit
- Truthful availability: Grexal=`draft_private`, Agensi=`pending_review` (public listing not observed)
- `unavailable` kept distinct from `no_users`
- Stop conditions honored: no invented users/revenue; no merge to default; no CloudAgent

## Files

- `experiments/scale-r2-20260910/distribution/03/**` — catalog kit, CLI, fixtures, tests, evidence INDEX, README
- `package.json` — `test:r2-distribution-03` (isolated)

## Tests (this VM)

- `npm run test:r2-distribution-03`: **8 pass / 0 fail**
  (positive Grexal+Agensi, negative/forbidden, partial missing cmds, unavailable, no_users, unavailable≠no_users, collapsed reject, required statuses)
- `node .../src/cli.mjs demo`: ready + draft_private/pending_review + distinct unavailable/no_users

```sh
npm run test:r2-distribution-03
node experiments/scale-r2-20260910/distribution/03/src/cli.mjs demo
```

## Actual result

Delivered `buildPortableCatalog`: one source-linked manifest of Grexal S124 + Agensi S131 with quoted install commands (`observed` vs recommended-not-run), availability statuses `available_local` | `draft_private` | `pending_review` | `unavailable` | `no_users`, CLI `demo|build|validate`.

## Remaining unknowns / next

- Root owns Grexal price/publish/visibility and Agensi PendingReview outcome
- Public marketplace listing / user counts remain unobserved — do not invent
