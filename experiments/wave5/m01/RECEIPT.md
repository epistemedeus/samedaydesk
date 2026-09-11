# RECEIPT — W5-M01 useful-engine composition

Repo: `epistemedeus/samedaydesk`
Branch: `cursor/w5-m01-select-and-wire-useful-engines-catalog-for-d01-keeping-first-offer-narrow-53b7`
Continue-from: `958361610cf1e2b62062040bf4e91f1371fe2f3e`
Implementation: `8454bc187fdae4c8ac15feec5bf8ed8f96f82b1c`
Owned paths: `experiments/wave5/m01/` plus imported `tools/{json-schema-webhook-drift,lockfile-pin-delta,route-table-diff,page-change-offline-job}/`
Did not write: `server/paid-useful-jobs/`, root `package.json`, live catalog, homepages.

## Import pins

| Engine | SHA |
| --- | --- |
| json-schema-webhook-drift | `27482b712a7221e5079d70df85c5dd5608dc70eb` plus items boolean fix |
| lockfile-pin-delta | `fba9d14872bc4c04214e527b9edfb30c2123c9e7` |
| route-table-diff | `886c81d824e0a24e2faa5b821b1cd0ca46ae0859` |
| page-change-offline-job | `fec7bc04ac4419f8e7ce40f2613314e6953af6bc` |

Independent corpora (read-only): M06 `4875dba8`, M07 `b4de86d4`, M08 `902ff58d`, M09 `da4c3e1c` from Pilot `9529591d` TERMINALS.json. D01 probed at `6bed72dd` / kernel `bccf34b3`.

## First offer

`lockfile-pin-delta`. Independent M07: 20/20 domain match on this tree. Version/integrity explained, resolved-only closed, noise informational, unsupported formats refuse, constant hasher cannot hide integrity.

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/m01/test/*.test.mjs
```

Node `v22`. **39 pass, 0 fail, 0 skipped.** Engine self-tests: schema 28, lockfile 29, route 23, page 26.

Independent replay vs imported engines: M06 specified-agree 20/20 (0 gaps after items fix); M07 domain 20/20; M08 25/27 with the two failures being Co12 assertions (unequal permutation digest; duplicate path as refuse) that M04 closed; M09 15/16 with the remaining mismatch `stale-option-noop` now `freshness=stale` (Co13 expected unused/unknown).

## Current-source findings

- No-change and refusals stay analysis/refuse, not crashes.
- Route permutation: `outcome=permutation`, equal `digest.v2`. Digests not forced unlike.
- Duplicate route path: analysis `breaking`, exit 0.
- Page-change refusals still stderr `{ok:false,code,message}`. `--max-stale-ms` binds `freshness=stale`.
- Next.js-shaped JSON is not a claimed format.

## D01

Unpatched `createExecutor` cannot select these engines (`unknown-job`). Adapter: `experiments/wave5/m01/lib/d01-adapter.mjs`. Exact `getJob` injection: `CONTRACT.md`. Not a sale.

No live settlement, payout, homepage, or default-branch push.
