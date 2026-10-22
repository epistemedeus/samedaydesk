# RECEIPT — W5-D13 Co16 buyer-value ledger

Repo: `epistemedeus/samedaydesk`
Head: `fc97c26c0d9be2f15b097471c4da9b8d09478313`
Branch: `cursor/w5-d13-co16-buyer-value-ledger-bound-to-actual-job-delivery-and-settlement-2890`
Draft PR: https://github.com/epistemedeus/samedaydesk/pull/104
Starting ref: `aa306e291adfdd499ca971af01625ccc4bfee5c4`
D01 pin tested: `aeef964fa188443078958d9d6d393afae1d542ee` (`fable/f08-paid-wrappers`, PR52) via read-only worktree `/tmp/ro-sds-pr52-aeef964`
Node: v22.14.0
Postgres: 16 (`/usr/lib/postgresql/16/bin` disposable `initdb`)

## Outcome

Wrong-source cache, unrelated payment, and failed results cannot become useful paid work. Valid analysis refusal stays an analysis outcome, not a crash. Output identity includes SHA-256, not byte counts alone. Settlement join requires exact operationId and job correspondence; evidence-records fixtures without jobId stay unbound. Request bytes are hashed before spawn. Ledger writes are rename-atomic. No competing wrapper copy.

## Proof (actual CLI / HTTP / process / Postgres)

```sh
cd tools/buyer-value-ledger
node --test --test-concurrency=1 test/*.test.mjs
```

**21 pass, 0 fail, 0 skip.**

| Case | Interface | Result |
| --- | --- | --- |
| Wrong archive file after warm cache | `bin/value.mjs --archive-file` | `archive_pin_mismatch`, `usefulPaidWork=false` |
| Wrong HTTP archive | `127.0.0.1` `--archive-origin` | `archive_pin_mismatch` |
| Unrelated `early-x402-revenue` | CLI `--operation-id` | `operationIdFound=true`, `boundToThisJob=false` |
| Valid refusal (invalid JSON) | CLI caller files | `outcomeKind=analysis_refusal`, not crash |
| Non-directory out-dir | CLI `--out-dir` file | `transport_failure`, `refused=false` |
| Crash + leftover files | `runLabelledJob` adapter | `engine_failure`, `producedThisRun=false` |
| Owner-qa example vs caller | CLI journey | two rows, `usefulPaidWork=false`, output sha256 |
| Postgres | disposable initdb | one row, `usefulPaidWork=false` |
| D01 consumer | import `runPaidOffer` at `aeef964` | useful delivery, `usefulPaidWork=false` |

## Current-source findings (reproduced then fixed)

At `aa306e2` `ensureUsefulJobsKit` returned a cached kit for a wrong buffer and labelled it `local-http`. `measureOutputs` treated leftover files as usable from byte counts only. `joinSettlement` treated `early-x402-revenue` as `matched` for `vendor-budget-impact`. Request hash ran after spawn. Whole-file ledger writes were not atomic.

## Integration limits

- Default spawn is pinned useful-jobs 1.0.0 on this branch. D01/PR52 `runPaidOffer` is an optional import (`BUYER_VALUE_LEDGER_D01_ROOT`). Later D01 wrapper amendments are not claimed.
- Evidence-records settlement documents have no jobId; they cannot bind as this job's payment. Overlay fixture `fixtures/settlement-bind/vendor-budget-impact.json` is ledger-local and is not hashed equal to the request.
- `usefulPaidWork` stays false: nonsettling prototype, owner-qa/fixture labels, and unbound payments. Not external acceptance.
- Live `https://samedaydesk.com` archive GET, live Stripe/x402, and Neo PR54 HTTP kernel were not used.

## Owned paths

`tools/buyer-value-ledger/` and this receipt. No root manifest or homepage rewrite.
