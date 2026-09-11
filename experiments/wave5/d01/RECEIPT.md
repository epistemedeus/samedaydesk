# W5-D01 RECEIPT — supplied-input execution contract

**Task:** W5-D01  
**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `codex/w5-d01-20260911`  
**HEAD:** (branch tip after this commit)  
**StartingRef:** `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52)  
**PR:** https://github.com/epistemedeus/samedaydesk/pull/74 (draft)  
**Pilot source:** `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`  
**D15 read-only:** `8564cd60f03d624f1f9c289c76c0ee424ba9df84` `experiments/wave5/d15/`  
**Contract:** `samedaydesk.paid-useful-jobs.execution.v1` (unchanged version string)

## What

Kernel freeze: getters once; file bytes slurped at snapshot; copy before inspect; engine and receipt use staged/`runOutDir` bytes. Caller `outDir` is a publication copy, not delivery identity. D15 harness was not vendored.

## Current-source findings

At `6bed72dd` (and SDS52 `aeef964`): `inspectSample(request)` ran before the main try; `request.inputs` was read again at materialize (6 reads in a getter repro). Mutating the live file on a later getter executed the new bytes; receipt sha256 followed the mutation, not the first observation. After complete delivery, `outputs`/`outputsDigest` were re-read from the caller alias, so a concurrent publisher could become another run's receipt.

D15 `@8564cd60` proved that on **aeef964** plus its own freeze shim. That is not this kernel. Reproduced here against `runPaidOffer` at `6bed72dd`, then fixed in `server/paid-useful-jobs/` only.

## Tests

```bash
npm run test:paid-useful-jobs
```

**PASS** — 51 pass, 0 fail, 0 skipped (`node --test server/paid-useful-jobs/test/*.test.mjs`).  
execution-contract 17 (was 12), continuity 8, journey 6, live-prices 3, seeded 9, wrappers 8.  
Real CLI concurrent `--out-dir`, library getters, live FS change after snapshot, isolated `runOutDir` vs foreign publication.

## Integration limits

- Same `execution.v1` fields. Receipts bind `runOutDir`; `publishedDir` is the optional alias copy.
- D15 remains independent harness owner. D04/D08/D14 not claimed.
- No multi-tenant hosting, live settle, deploy, or spend.
