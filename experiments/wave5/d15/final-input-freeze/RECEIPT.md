# W5-D15 RECEIPT — final-input-freeze

**Date:** 12 September 2026
**Assignment:** Independent final-input check of the D01 release candidate at the prepare→execute boundary
**Repo:** epistemedeus/samedaydesk
**Branch:** `cursor/w5-d15-deterministic-input-execute-race-harness-4fc6`
**Draft PR:** https://github.com/epistemedeus/samedaydesk/pull/75
**Owned path:** `experiments/wave5/d15/final-input-freeze/`
**No D01 production edits.** Root publishes after reconciliation.

## Pins

| Role | Value |
| --- | --- |
| Owning implementation | `46f2b7f55a7fb780333073a5197b64b8fde64a33` (PR74, `codex/w5-d01-20260911`) |
| Public PR114 | `9ae0febd8c184c0cbbb5e481ba31ac620e89b869` |
| Public archive | `client/public/for-agents/useful-jobs/useful-jobs-1.2.0.tar.gz` 2579117 / `dec31ea66f1605fb9578c7d15c9583b130c6e2c0b82b5e6b93422381a04461eb` |
| Kernel freeze (not re-run as coverage) | `e2f951cae7bb299df2283b9c181bb0d369fc26af` |
| Engine source (not re-audited) | `d2a0d0b2798e9a3951c43fe16dd64215207c3d9b` |

## Actual command

Read-only worktree `/tmp/d15-readonly/d01-46f2b7f`. Caller files under `/tmp/d15-final-*`.

```bash
node /tmp/d15-readonly/d01-46f2b7f/server/paid-useful-jobs/bin/deliver.mjs \
  --job lockfile-pin-delta \
  --before "$BEFORE_LOCKFILE" \
  --after "$AFTER_LOCKFILE"
```

Prepare→execute probe (same CLI; wraps product `runCreateOrder` after preflight):

```bash
node --import experiments/wave5/d15/final-input-freeze/lib/preload.mjs \
  /tmp/d15-readonly/d01-46f2b7f/server/paid-useful-jobs/bin/deliver.mjs \
  --job page-change-offline-job --job-file "$JOB"
```

Tests (this subdirectory only):

```bash
node --test experiments/wave5/d15/final-input-freeze/test/*.test.mjs
```

## Verdict

Pending first test run on this revision.
