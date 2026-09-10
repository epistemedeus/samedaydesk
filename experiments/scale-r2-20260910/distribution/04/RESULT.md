# R2-DISTRIBUTION-04 RESULT — Agent acquisition intent links

Date: 2026-09-10. Owner: Pilot Market Distribution R2 (`32d5b452`).

## Exact source / ref

- Repository: `epistemedeus/samedaydesk`
- Branch: `codex/r2-distribution-04-20260910`
- Pin: `2b80f38a4e5ec5f080d1764de7c539af63190012`
- Local commit (feature): `TIP_PLACEHOLDER`
- Worktree: `/workspace/pilot/worktrees/r2-distribution-04-20260910`
- Scope: `experiments/scale-r2-20260910/distribution/04`
- Remote: pending push `origin/codex/r2-distribution-04-20260910`

## Preflight

- Extended existing S124 / S131 + DISTRIBUTION-01/02/03 evidence (INDEX pointers only)
- Did **not** rebuild Grexal/Agensi packages; did **not** login / price / publish / review-submit
- Synthetic fixtures only for acquisition signals; DEMO cites catalog entry ids as link targets without claiming live clicks
- Click / `linkActivated` never equated with buyer or purchase intent
- `unavailable` kept distinct from `no_users`
- Stop conditions honored: no invented traffic/buyers; no merge to default; no CloudAgent

## Files

- `experiments/scale-r2-20260910/distribution/04/**` — tag/event kit, CLI, fixtures, tests, evidence INDEX, README
- `package.json` — `test:r2-distribution-04` (isolated)

## Tests (this VM)

- `npm run test:r2-distribution-04`: **11 pass / 0 fail**
  (positive tagged+recorded, negative malformed/forbidden-intent, partial missing source, unavailable, no_users, click≠intent, unavailable≠no_users, collapsed reject, source-tag set)
- `node .../src/cli.mjs demo`: ready tags + recorded/unavailable/no_users + clickIsNotIntent + distinct

```sh
npm run test:r2-distribution-04
node experiments/scale-r2-20260910/distribution/04/src/cli.mjs demo
```

## Actual result

Delivered `tagEntries` + `emitResultEvents`: explicit `source=grexal|agensi|catalog|manual` (+ opaque campaign/ref) on product entry links; privacy-bounded events (`linkPresented` / `linkActivated` / `sourceTag`) that forbid `buyerIntent` / `purchaseIntent` / activation-equals-intent; capture outcomes `recorded` | `unavailable` | `no_users` with unavailable omitting `activationCount`.

## How invariants are enforced

- **click ≠ intent**: `FORBIDDEN_INTENT_FIELDS` rejected on validate; events set `impliesBuyerIntent: false`; `claims.activationEqualsBuyerIntent` must stay false; tests poison and reject.
- **unavailable ≠ no_users**: unavailable outcome omits `activationCount`; no_users sets `activationCount: 0`; distinct codes; `assertCaptureDistinct` + collapsed-label reject.

## Remaining unknowns / next

- Root owns Grexal price/publish/visibility and Agensi PendingReview outcome
- Live marketplace click capture remains unobserved — do not invent
