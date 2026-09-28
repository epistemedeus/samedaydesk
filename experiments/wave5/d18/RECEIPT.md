# W5-D18 RECEIPT — artifact contamination harness

**Date:** 11 September 2026
**Repo:** `epistemedeus/samedaydesk`
**Branch:** `cursor/w5-d18-artifact-contamination-harness-across-sequential-and-simultaneous-jobs-3d45`
**HEAD:** `d7325c8eb642ceb0649190827063a2face102bb0` 
**Owned path:** `experiments/wave5/d18/`
**Starting ref:** `aeef964fa188443078958d9d6d393afae1d542ee`
**Integration owner:** W5-D01
**Draft PR:** https://github.com/epistemedeus/samedaydesk/pull/86

## Tested pins (not a future sibling claim)

| Owner | Pin | Interface used |
| --- | --- | --- |
| W5-D01 / PR52 | `aeef964fa188443078958d9d6d393afae1d542ee` | `server/paid-useful-jobs/bin/cli.mjs` spawned as a child |
| W5-D03 / Co17 PR69 | `58cba6324c1d9793d344bc13154b8b2380e8166f` | `verifyComplete` imported from a read-only worktree |

D03 was not present in this checkout. Loader used a detached worktree of that SHA. `D03_ROOT` and an in-tree `tools/job-output-atomicity` are accepted when present. Missing D03 is `missing-d03`, not a skipped pass.

## Commands

Node v22.14.0. No extra npm install. No root `package.json` edit.

```bash
node --test --test-concurrency=1 experiments/wave5/d18/test/*.test.mjs
```

**PASS** — 14 tests, 0 fail, 0 skipped, 0 todo. ~3.2s. Suites: journey, sequential, simultaneous, seeded, HTTP, postgres probe.

```bash
node experiments/wave5/d18/bin/contamination.mjs satisfy --root <dir> --job vendor-budget-impact
```

Exercised from `test/journey.test.mjs` against a copied complete package.

## Current-source findings

Reproduced Root's PR52 prediction at `aeef964`: caller `--out-dir` is reused (`mkdirSync` recursive). Sequential `vendor-budget-impact` then `feed-agenda` into the same directory leaves `budget-impact.*` beside `agenda.*`. D03 `verifyComplete` on that directory is `complete` for `feed-agenda`. D18 `satisfy --job vendor-budget-impact` refuses (`foreign-job-artifacts`). Isolated copies of job A still satisfy A.

Simultaneous isolated children cannot satisfy each other's package. Two children sharing one `outDir` cannot both be satisfied from that directory.

Valid no-change (`before.json` as both sides) stays `ok` from the D01 CLI, artifact `status: informational`, and satisfies its own job. A different inspected `inputsDigest` cannot use the change-run package. Missing `--after` is `missing-required-inputs`, CLI exit 2, and cannot satisfy.

Empty `outputs: [{}]`, missing last output, truncated receipt, and mutated bytes cannot satisfy. Engine `generatedAt` makes `outputsDigest` differ across unlike executions; those hashes were not forced equal.

## Remaining integration bindings

| Binding | Owner |
| --- | --- |
| Per-job isolated staging so a reused `outDir` does not leave foreign siblings | W5-D01 |
| Existence-filter of leftover same-name files after a successful engine that wrote a subset | W5-D01 (latent; current engines overwrite both catalog outputs) |
| Wave5 D03 amendments to `verifyComplete` (caller expected-job bind lives here today) | W5-D03 |
| Domain-outcome contract beyond this harness's change vs no-change vs refusal distinction | W5-D17 |
| Postgres-backed archive index | untested-external: `127.0.0.1:5432` `ECONNREFUSED`; not faked |
| Hosted mailbox / live settle | out of scope |

## pstack (this VM)

Marketplace plugin `9717366` v0.15.1, pin `cursor/plugins@68d834d9ca8f34c375ecb8057bfbcde5396a01f8`. Parent run model `cursor-grok-4.6-xhigh`. Skills used by explicit file read: `setup-pstack`, `principle-prove-it-works`, `principle-test-behavior-not-implementation`, `principle-boundary-discipline`. Slash text was not the invocation path. No Task/Cloud children spawned (Root counts the cohort). `~/.cursor/rules/pstack-models.mdc` was not written (setup-pstack requires confirmation).

## Out of scope

No default-branch push, production deploy, spend, payout, or unsolicited messages. Homepage and root manifest untouched. I01 terms hashes were not compared across schemas.
