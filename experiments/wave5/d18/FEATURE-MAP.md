# Feature map — artifact contamination harness

| Field | Value |
| --- | --- |
| User goal | Stale, foreign, or partial artifact sets cannot be accepted as another job's delivery. |
| Entrypoint | `experiments/wave5/d18/` (`lib/satisfy.mjs`, `bin/contamination.mjs`) |
| Command | `node experiments/wave5/d18/bin/contamination.mjs satisfy --root <dir> --job <job-id>` |
| State | `satisfied` only when D03 `verifyComplete` is `complete` and the receipt binds the expected job (and inspected inputsDigest when supplied). `sold` stays false. |
| Tests | `node --test --test-concurrency=1 experiments/wave5/d18/test/*.test.mjs` |
| Account prerequisite | None. Offline D01 CLI + D03 worktree + loopback HTTP. No wallet, facilitator, or live settle. |
| Producer | D01 CLI from this tree or `F08_ROOT`, pin `aeef964`. D18 does not amend `server/paid-useful-jobs`. |
| Completeness | D03 `verifyComplete` at `58cba632`. Missing D03 is `missing-d03`, never a skipped pass. |

## Caller journey

1. Spawn pinned `paid-useful-jobs` `run vendor-budget-impact` into an isolated `--out-dir`.
2. `satisfy --root <that dir> --job vendor-budget-impact` → satisfied.
3. Copy the directory, or fetch it over loopback HTTP, and satisfy the same job again.
4. Present that package as `feed-agenda`, or reuse the same `--out-dir` for a second job, or drop an output → not satisfied for the other job.

## Later integration bindings

| Binding | Owner |
| --- | --- |
| Per-job isolated staging / no leftover siblings in a reused `outDir` | W5-D01 |
| Wave5 D03 amendments to `verifyComplete` | W5-D03 |
| Domain-outcome contract (change vs no-change vs refusal) | W5-D17 |
| Hosted mailbox and Postgres-backed archive index | Root |
