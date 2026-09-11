# W5-D04 RECEIPT — Co20 managed-order client

**Task:** W5-D04  
**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `cursor/w5-d04-co20-managed-order-client-removing-its-competing-runner-979c`  
**Head:** `86f65ceb12f32a96f28d6c216965754999cbc02b`  
**StartingRef:** `13d1fc023ce235b1611dc868caf5dd84fe5f11c7`  
**PR:** https://github.com/epistemedeus/samedaydesk/pull/107  
**Pilot source:** `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`  
**Tested D01:** this tree `codex/w5-d01-20260911` PR74 (historical pin `6bed72dd` not spawned)  
**Packet PR52 pin:** `aeef964fa188443078958d9d6d393afae1d542ee`  
**Contract:** `samedaydesk.paid-useful-jobs.execution.v1`

## What

Removed the competing useful-jobs CLI runner (`lib/engine.mjs`, `lib/kit.mjs`).
The order client calls D01 `createExecutor`/`runPaidOffer` (optional
`--execute-url` posts to D01 `/execute`). Reserve happens before execute. Holder
tokens distinguish in-process clients that share a PID. Concurrent CLI processes
and two Postgres clients produce one order. A dead reserved holder is adopted
once. `sold` stays false.

## Changed paths

- `tools/managed-useful-jobs-order/`
- `experiments/wave5/d04/RECEIPT.md`

## Tests

```bash
npm run test:managed-useful-jobs-order
```

**21 pass, 0 fail, 0 skipped, 0 cancelled** (Node v22.14.0). Composition re-test on PR 74. Suites: concurrent 2, boundaries 3, HTTP listener 2, hygiene 3, journey 1, Postgres 2, seeded 8. Real CLI/process, loopback HTTP, D01 `/execute`, disposable Postgres 16. File-store CLI does not import `pg` until `--database-url`.

## Current-source findings

Co20 at `13d1fc0` spawned useful-jobs itself (competing runner). File/Postgres stores wrote only after execute, so concurrent same-`orderId` work could run twice. In-process two clients sharing a PID were treated as one holder until a reservation token was added.

REVIEW-INTEGRATION Co20: reuse PR52/D01 instead of another runner; missing JSON, corrupt replay, atomic reservation, stale output, omitted funding/terms tested independently. Valid D01 analysis/refusal is nested; transport failure is not labeled a useful report. Unlike order-terms and receipt hashes are not forced equal.

## Integration limits

- Tested implementation: D01 `6bed72dd` + this client. Not a future sibling.
- Remaining binding: D01 may still amend the wrapper; D19 owns additional multi-process order/ledger tests.
- Wrapper is loaded from `MANAGED_ORDER_WRAPPER_ROOT` or in-tree `server/paid-useful-jobs` after D01 merge.
- No homepage, root manifest, live settlement, deploy, or new spend.
- pstack: read `setup-pstack`, idempotent-operations, migrate-callers; `~/.cursor/rules/pstack-models.mdc` absent; no extra Cloud/Task agents. Parent model: Cursor Grok 4.6 xhigh.
