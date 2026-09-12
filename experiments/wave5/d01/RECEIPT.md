# W5-D01 RECEIPT — supplied-input execution contract and delivery composition

**Task:** W5-D01  
**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `codex/w5-d01-20260911`  
**PR:** https://github.com/epistemedeus/samedaydesk/pull/74 (draft)  
**Contract:** `samedaydesk.paid-useful-jobs.execution.v1`  
**Kernel freeze:** `e2f951cae7bb299df2283b9c181bb0d369fc26af`

## Current (public 1.1.0 download)

The four engines are in the public useful-jobs **1.1.0** archive. Version 1.0.0
URLs stay. SDS52 wrappers still extract 1.0.0. No new paid HTTP merchant route.

| Item | Value |
| --- | --- |
| Archive | `client/public/for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz` |
| Bytes / sha256 | 2577606 / `de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534` |
| Previous | `useful-jobs-1.0.0.tar.gz` 2522418 / `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` |
| H04 inputs | pin `37dd4b42cf21dc2031715971971bb2426a7beb80` copied into `samples/` |
| Pack | `server/paid-useful-jobs/scripts/build-useful-jobs-archive.mjs` |

Live front door: `server/paid-useful-jobs/RECEIPT.md`.

## Historical composition (pre-1.1.0 public download)

The following described the in-repo delivery kit **before** the public 1.1.0
archive. M01 was later wired; this section is historical evidence, not the
current public download.

**StartingRef:** `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52)  
**Pilot source:** `epistemedeus/pilot@254e4c46259842ac6b0e66943e6568b1681e8e01`  
**D15 read-only:** `a44fbf4` PR 75 (`experiments/wave5/d15/`). Inspected export only. Freeze-shim `--bind frozen` is not product acceptance and was not copied.

### What (historical)

Kernel freeze: getters once; file bytes slurped at snapshot; copy before inspect; engine and receipt use staged/`runOutDir` bytes. Caller `outDir` is a publication copy, not delivery identity. D15 harness was not vendored.

This composition continues that kernel into one locally callable supplied-input delivery kit: D02 preflight → D04 managed order → D01 executor → D03 `verifyComplete(runOutDir)` → D05 mailbox pickup/ack, plus a disjoint second job. Transferred paths were selected-path checkouts (D02 `6ac8ad6e`, D03 `c89865f3`, D04 `c1f1e5f8`, D05 tip `bc0b6e3` / tested `38d09206`, D28 `049e8592`). Ancestor branches were not merged. Duplicate mailbox engine runner was deleted, not wrapped.

D15 exact export at `a44fbf4`: `runRace` / `spawnPaidCli`, `startRaceServer`, `BIND`/`KIND`/`REFUSE_CODE`, `freezeCallerInputs`/`liveDrift`, `ensureKernelRoot`/`D01_SHA`, `replayKernelCli`. Product evidence there is replay of **this** freeze at `e2f951ca` (CLI, HTTP `/execute`, getters, useful no-change). Not copied.

### Current-source findings (historical at `6bed72dd`)

At `6bed72dd` (and SDS52 `aeef964`): `inspectSample(request)` ran before the main try; `request.inputs` was read again at materialize (6 reads in a getter repro). Mutating the live file on a later getter executed the new bytes; receipt sha256 followed the mutation, not the first observation. After complete delivery, `outputs`/`outputsDigest` were re-read from the caller alias, so a concurrent publisher could become another run's receipt.

D02 claimed D01 did not pricing-row schema-check, so schema-invalid staged bytes could still execute there. That gap is closed at service entry (`lib/input-schema.mjs`). Invalid `{ hello: "world" }` pricing JSON is `input-schema-mismatch`, not useful.

`createExecutor({ catalog })` / `createExecutor({ getJob })` is the catalog injection seam. **Historical note:** this paragraph recorded “M01 was not integrated.” That is no longer current; default `createExecutor` overlays `createM01AwareGetJob` + `runEngineForD01`. H05 is not this repo.

### Consumer command

```bash
node server/paid-useful-jobs/bin/deliver.mjs \
  --job lockfile-pin-delta \
  --before "$BEFORE_LOCKFILE" \
  --after "$AFTER_LOCKFILE"
```

`--http` mounts loopback `POST /execute`. `--second-after` runs a disjoint second job. Isolated `runOutDir` is delivery identity; `publishedDir` is last-writer convenience copy.

## Integration limits

- Same `execution.v1` fields. Receipts bind `runOutDir`; `publishedDir` is the optional alias copy, never receipt authority.
- D15 remains independent harness owner. Freeze-shim is not this kernel.
- No live Hostinger deploy or default merge in the 1.1.0 public-download assignment.
- No multi-tenant hosting, live settle, spend, or paid HTTP merchant claim.
- D03 host Postgres TCP `127.0.0.1:5432` remains `untested-external`.

