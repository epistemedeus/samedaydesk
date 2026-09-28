# RECEIPT: W5-D19 multi-process order/ledger tests

Consumer harness only. Owned path `experiments/wave5/d19/`. No Co20/Co16 kernel copy, no root manifest, no homepage edit.

## Exact source tested

| Pin | SHA | How loaded |
| --- | --- | --- |
| SDS PR52 starting checkout | `aeef964fa188443078958d9d6d393afae1d542ee` | this branch base |
| Co20 managed order (W4-commerce-20) | `13d1fc023ce235b1611dc868caf5dd84fe5f11c7` | read-only pin worktree, CLI `tools/managed-useful-jobs-order/bin/orders.mjs` |
| Co16 buyer-value ledger (W4-commerce-16) | `aa306e291adfdd499ca971af01625ccc4bfee5c4` | read-only pin worktree, CLI `tools/buyer-value-ledger/bin/value.mjs` |

D04 and D13 were not merged into this checkout. In-tree `tools/managed-useful-jobs-order/` and `tools/buyer-value-ledger/` are absent. Tests materialize those SHAs. When those directories exist later, locate prefers in-tree and records that SHA.

## Commands

```bash
cd experiments/wave5/d19
npm install
node --test --test-concurrency=1 test/*.test.mjs
node bin/d19.mjs
node bin/d19.mjs --assert-intended
```

`--assert-intended` exits 2 on this pin (expected until D04/D13). Exit 3 means incomplete (missing git pin, pg module, or initdb). Missing deps are not skipped passes.

## Executed tests

Node v22.14.0. PostgreSQL 16.15 at `/usr/lib/postgresql/16/bin`. `pg@8.23.0` installed under this package (Co20 `orders.mjs` statically imports `pg` even for the file store).

`node --test --test-concurrency=1 test/*.test.mjs`

**17 tests, 7 suites, 17 pass, 0 fail, 0 skip.** Duration about 5.9s after kit cache.

`node bin/d19.mjs --assert-intended` → exit 2. Distinct jobs preserved. One store file for `ord-1`. Duplicate engine outputs true. Ledger barrier lost 7/8 trials.

## Current-source findings

Source-only predictions reproduced on the real CLIs, HTTP listener, and disposable Postgres.

1. Co20 file and Postgres stores keep one `ord-1` row when two processes create the same orderId. Both out-dirs still contain `upgrade-brief.json`. Reservation is after `engine.run`. D04 owns reserve-before-run.
2. Co20 `CREATE SCHEMA IF NOT EXISTS` is not safe for two first connects. Concurrent CLI without warmup raises `23505` on `pg_namespace_nspname_index`. Tests warm the schema once, then race inserts. D04 owns that connect path.
3. Co20 `listen` uses `requestDir: process.cwd()`. Relative fixture paths refuse as `missing-input-file`. HTTP tests send absolute cloned paths. Not a D19 kernel.
4. Co16 `appendRow` is load/push/writeFileSync. A 4-writer barrier lost rows in 7/8 trials. Two `value.mjs` CLI processes still kept both jobs here because engines rarely finish in the same millisecond. D13 owns an atomic append.
5. Postgres ledger inserts with distinct `runId` keep both jobs. Unlike order `termsHash` and ledger `requestHash` are not forced equal. `hashTerms.competingKernelCopied` is false.
6. `example:true` returns parseable `F-SAMPLE` beside a successful sibling. Missing buyerClass returns `missing_buyer_class`. Engine `status: partial` with `usableOutput: true` is a domain outcome, not a transport crash.

## Remaining integration binding

W5-D01 owns wrapper/runtime wiring. W5-D04 owns making Co20 a client of that contract and removing duplicate execution. W5-D13 owns binding the ledger to actual delivery/settlement and fixing whole-file updates. This slot does not claim those future heads.

pstack on this VM: plugin cache `9717366`, skills read (`poteto-mode`, `principle-prove-it-works`, `principle-test-behavior-not-implementation`, `principle-laziness-protocol`, `principle-separate-before-serializing-shared-state`, `setup-pstack`, `opening-a-pr`). Run model `cursor-grok-4.6-xhigh`. No `/swarm` or `/setup-pstack` invocation. No extra Cloud agents.
