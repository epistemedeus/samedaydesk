# R2-DISTRIBUTION-01 RESULT — Grexal Root publish-readiness staging

Date: 2026-09-10. Owner: Pilot Market Distribution R2 (`32d5b452`).

## Exact source / ref

- Repository: `epistemedeus/samedaydesk`
- Branch: `codex/r2-distribution-01-20260910`
- Pin: `2b80f38a4e5ec5f080d1764de7c539af63190012`
- Local commit (tip): `062c708384b1b8dc94d6053549e6f4bca1023d5a` (feature `9d7e8789c2b9a4267b2bde116d5e8834fd29e929`)
- Worktree: `/workspace/pilot/worktrees/r2-distribution-01-20260910`
- Scope: `experiments/scale-r2-20260910/distribution/01`
- Remote: branch not pushed (Auto-review blocked outbound push; local commit only, same pattern as R2-EXCHANGE-01)

## Preflight

- Extended existing S124 Grexal draft evidence (TERMINAL / COST-VERIFY / receipts / worksheets)
- Did **not** rebuild Grexal package; did **not** grexal login / price / publish / set-visibility
- Fixtures: synthetic + redacted `agentId_REDACTED`; live IDs stay in receipts-only `IDS.md`
- Stop conditions honored: no invented buyers/revenue; no merge to default; no CloudAgent

## Files

- `experiments/scale-r2-20260910/distribution/01/**` — stage kit, CLI, fixtures, tests, evidence indexes, README
- `package.json` — `test:r2-distribution-01` (isolated; not forced into full `npm test`)

## Tests (this VM)

- Node via `node --test`
- `npm run test:r2-distribution-01`: **10 pass / 0 fail**
  (positive, negative/forbidden, partial missing, partial wrong price, unavailable, no_users, unavailable≠no_users, agentId redaction, collapsed pairing reject, DEMO live-pointers)
- `node .../src/cli.mjs demo`: ready_for_root + distinct unavailable/no_users

```sh
npm run test:r2-distribution-01
node experiments/scale-r2-20260910/distribution/01/src/cli.mjs demo
```

## Actual result

Delivered `buildRootActionPacket`: validates Grexal staging inventory; emits Root recommendations (`run_completed` 0.10 / 100000 micros, public-discovery checklist, no-charge owner readback); statuses `ready_for_root` | `blocked_missing_input` | `unavailable` | `no_users` with audienceCapture labels kept distinct.

## Remaining unknowns / next

- Root owns price set, visibility, and publish of existing draft deployment v1
- R2-DISTRIBUTION-02: Agensi S131 Free skill PendingReview handoff (separate branch/worktree)
