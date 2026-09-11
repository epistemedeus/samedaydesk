# RECEIPT — W5-D03 Co17 output completeness/identity validator

**Date:** 11 September 2026
**Repo:** `epistemedeus/samedaydesk`
**Branch:** `cursor/w5-d03-co17-output-completeness-identity-validator-reused-by-consumers-0b90`
**Owned paths:** `tools/job-output-atomicity/`, `experiments/wave5/d03/RECEIPT.md`
**Starting ref:** `58cba6324c1d9793d344bc13154b8b2380e8166f`
**Draft PR:** https://github.com/epistemedeus/samedaydesk/pull/112
**Compare:** https://github.com/epistemedeus/samedaydesk/compare/main...cursor/w5-d03-co17-output-completeness-identity-validator-reused-by-consumers-0b90
**Integration owner:** W5-D01
**Cloud run:** `bc-a421f8f1-0886-469c-bcb6-a8d82fed8ec3`

## Tested producer

F08 `aeef964` is historical. Composition producer is this tree's D01 CLI. Named pin `bae3e7cd…` was not spawned.

I01 hasher remains Neo PR54 `819fa637ecf5e5177c84efc16fcaa18d57017631` vendored files plus LICENSE.

## Current-source findings (reproduced at 58cba632)

| Case | Before | After |
| --- | --- | --- |
| `outputs: [{}]` unknown job | `complete` | `empty-output-object` |
| Unknown `jobId` plus named foreign file | `complete` | `unknown-job` |
| Unknown receipt schema on a real package | `complete` (note only) | `unrecognized-receipt-schema` |
| Extra listed `agenda.ics` with rewritten digest | `complete` | `foreign-output-name` |
| Foreign markdown bytes, no per-file sha256, no `outputsDigest` | `complete` | `missing-output-digest` |
| FIFO named as catalog output | hung on `readFileSync` | `special-output-file`, no hang |
| Symlink to foreign bytes with matching hashes | `complete` | `special-output-file` |
| Identical before/after `vendor-budget-impact` | already `complete`, `analysisStatus: informational` | preserved |
| Missing `--after` wrapper refusal | not `complete` | still not `complete` |
| Unlike disclosure vs identity hashes | not forced equal | still not forced equal |

Engine archive origin is now required. Stable size without sha256 is not origin.

## Commands

Node v22.14.0. Producer is this tree's D01 CLI.

```bash
npm run test:job-output-atomicity
node tools/job-output-atomicity/bin/verify-complete.mjs --root <package-dir>
```

**PASS** — 26 tests, 0 fail, 0 skipped. Composition re-test on PR 74. Suites: hash-terms 3, HTTP 1, identity 11, interrupt 2, journey 2, postgres probe 1, seeded 6.

Postgres at `127.0.0.1:5432` was `ECONNREFUSED`. The probe records `untested-external`. Completeness does not depend on a database. No fake database and no skipped-as-pass gate.

## Consumer contract

`tools/job-output-atomicity/CONTRACT.md` and `index.mjs` export `verifyComplete`, `VERIFY_CODES`, `TESTED_PRODUCER`, `F08_TESTED_SHA`. D07 may import that. Hosted mailbox HTTP and a Postgres archive index remain Root.

## Material integration limits

- Wrapper publication is still non-atomic at tested F08. Interrupt leftover files stay not-complete.
- Absolute `path` / `outDir` on receipts still need basename rebind.
- Live settle, facilitator, and purchase authority stay out of scope (`sold: false`).
- D01 may change the wrapper. Re-run this suite against the new SHA before claiming that head.
