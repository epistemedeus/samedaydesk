# RECEIPT — W4-commerce-17 interrupted-output atomicity

**Date:** 11 September 2026
**Repo:** `epistemedeus/samedaydesk`
**Branch:** `codex/w4-commerce-17-20260911`
**Owned path:** `tools/job-output-atomicity/`
**Starting main:** `5b97d1b02e786acd1895cfa1508087ae3f7a1545`
**Draft PR:** https://github.com/epistemedeus/samedaydesk/pull/69
**Compare:** https://github.com/epistemedeus/samedaydesk/compare/main...codex/w4-commerce-17-20260911
**Integration owner:** Root

## Source heads

| Item | Value |
| --- | --- |
| SDS main start | `5b97d1b02e786acd1895cfa1508087ae3f7a1545` |
| F08 named assignment pin | `bae3e7cd5034b21019fb272a99d88db964b831ee` (paths present; not spawned) |
| F08 tested public CLI | `aeef964fa188443078958d9d6d393afae1d542ee` on `fable/f08-paid-wrappers` |
| I01 hasher | Neo PR54 `819fa637ecf5e5177c84efc16fcaa18d57017631` `packs/funded-task-terms/src/{hash,canonical}.mjs` |
| useful-jobs archive | sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`, 2522418 bytes |

F08 is absent on SDS main. Tests `git fetch origin fable/f08-paid-wrappers` and add a detached worktree. No competing kernel was copied into `server/paid-useful-jobs`.

## Commands

Node v22.14.0. No extra npm install. No root `package.json` edit.

```bash
git fetch origin fable/f08-paid-wrappers
node --test --test-concurrency=1 tools/job-output-atomicity/test/*.test.mjs
node tools/job-output-atomicity/bin/verify-complete.mjs --root <package-dir>
```

**PASS** — 15 tests, 0 fail, ~3.1s after the F08 worktree already existed (first wrapper run extracts the in-repo archive into `$TMPDIR`).

## Caller journey (local-runtime)

`vendor-budget-impact` with F08 caller files and reserved-fixture payment → `budget-impact.json`, `budget-impact.md`, `receipt.json`. `verify-complete --root` → `complete`, `sold: false`, `termsVersion` `sha256:`+64 hex. Copy that directory to a new root (and a separate loopback HTTP fetch into another root) → still `complete`. Absolute F08 `path` fields are not read.

## Seeded failures

| Case | Evidence class | Result |
| --- | --- | --- |
| Missing last output (`budget-impact.md`) | fixture | `partial` / `missing-output` |
| Truncated receipt JSON | fixture | `partial` / `truncated-receipt` |
| Receipt path `../outside-secret.json` | fixture | `unknown` / `receipt-path-escapes-root` |
| Digest rewritten during read | local-runtime mutator | `unknown` / `digest-changed-after-read` |
| SIGKILL around receipt publication | local-runtime child | not `complete`; leftover `JOA_RUN_ID` pids empty |
| Integer `termsVersion` | fixture | `integer-terms-version-not-a-claim-key` |

## Producer notes for I02 (not amended here)

F08 `writeFileSync` of outputs and `receipt.json` is not an atomic directory publish. Interrupt before receipt leaves leftover files; the consumer treats that as `missing-receipt`, not complete. Receipts stamp absolute `path` / `outDir`; a copied package verifies only because this consumer rebinds by basename and refuses relative escapes.

## Untested

| Item | Class | Why |
| --- | --- | --- |
| Postgres archive index | untested-external | `127.0.0.1:5432` `ECONNREFUSED`; no fake database |
| Hosted mailbox, live settle, facilitator | untested-external | out of scope |
| Other five job ids as the interrupt target | untested | journey uses `vendor-budget-impact`; catalog names are still required |
| Live `@neomorphic/funded-task-terms` package | later binding | hasher vendored from I01; kernel not imported |

## Next integration owner

Root collects this output. I02 owns producer atomic publish if they take the notes above.
