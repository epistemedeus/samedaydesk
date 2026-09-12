# Paid useful-jobs — current integration receipt

**Current:** W5-D01 public useful-jobs **1.1.0** download on `codex/w5-d01-20260911` (PR74).  
**Contract:** `samedaydesk.paid-useful-jobs.execution.v1`  
**Kernel freeze:** `e2f951cae7bb299df2283b9c181bb0d369fc26af`

This file is the live front door for this tree. Historical F08 evidence is kept
below with its original label. Do not treat the 22-test / engines-not-unpacked
description as current.

## Current public download

Customers obtain the four engines from a **new** versioned archive. Version
**1.0.0 URLs are unchanged**.

| Asset | Path |
| --- | --- |
| Current archive | `client/public/for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz` |
| Current pin | `client/public/for-agents/useful-jobs/useful-jobs-1.1.0.sha256.json` |
| Kit mirror | `client/public/kit/useful-jobs-1.1.0.tar.gz` |
| Catalog / outcomes | `client/public/for-agents/useful-jobs/catalog.json`, `jobs-outcomes.json` |
| Discovery | `client/public/discovery/useful-jobs.json` |
| Previous 1.0.0 | `client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz` (2522418 bytes, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`) |

Archive **2577606** bytes, sha256 `de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534`.
Root `useful-jobs-1.1.0`. Cold CLI: `node bin/useful-jobs.mjs`.

Pack recipe: `node server/paid-useful-jobs/scripts/build-useful-jobs-archive.mjs`
(extract 1.0.0, add engine runtimes + compatibility apps, H04 public samples).

SDS52 wrappers (`ensureUsefulJobsKit`) still extract **1.0.0** for the original
six jobs. The four engines run in-tree via `runEngineForD01` (identity pin), not
the 1.1.0 tarball.

This is a usable **offline execution kit**. H01's merchant route is still not
deployed. No new public paid HTTP endpoint is claimed. `sold` stays false.

Consumer command (repo tree, unfunded/local):

```bash
node server/paid-useful-jobs/bin/deliver.mjs \
  --job lockfile-pin-delta \
  --before "$BEFORE_LOCKFILE" \
  --after "$AFTER_LOCKFILE"
```

Public archive command (after verify/extract of 1.1.0):

```bash
node bin/useful-jobs.mjs run lockfile-pin-delta \
  --before ./samples/lockfile/h04-pub-lock-01/before.json \
  --after ./samples/lockfile/h04-pub-lock-01/after.json \
  --out-dir ./out/h04-lock
```

## Historical F08 (11 September 2026)

The following is the original F08 wrapper receipt. It described SDS52 adapters
around the six PR51 jobs in `useful-jobs-1.0.0.tar.gz` (22 tests). Engines were
not yet unpacked under `tools/`. First public command there was vendor-budget.
Kept as evidence; superseded as current status.

**Date:** 11 September 2026  
**Branch:** `fable/f08-paid-wrappers`  
**HEAD:** `e935bd8` on `fable/f08-paid-wrappers`  
**Base:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51 useful-jobs public integration)

### What (historical)

Paid-offer adapters around the six already-useful offline jobs. Journey:
supplied input → existing engine → usable outputs + receipt. Funding states:
`unfunded | reserved-fixture | rejected`. `sold` is always false. Live
settlement is out of scope.

Continuity (merchant PR54 `a143898dd1ec35c097ca7eb0b472f30dad1ee319`, module
`indexing-payload-continuity.mjs`) fills omitted `paymentPayload.resource` and
`extensions.bazaar` from declared route metadata via ResourceServer
`onBeforeVerify` / `onBeforeSettle`. Does not reassign `verifyPayment` /
`settlePayment`. Fixture / test payments are labelled `fixture` /
`purchaseAuthority: false`.

### Source vs brief (historical)

- Engines are **not** unpacked source under `client/`, `server/`, `tools/`, or
  `experiments/`. They live in the published archive
  `client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz`
  (2522418 bytes, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`,
  `purchaseAuthority: false`). Wrappers extract that archive and invoke
  `node bin/useful-jobs.mjs run <id>`.
- SDS Express has **no** x402 ResourceServer. Implemented a local non-settling
  envelope. Live settlement is out of scope.
- Live extract `$0.005` and seller-integrity-audit `$0.01` were not changed.
- Wrapper prices are labelled non-live fixtures (`0.02` USDC) and are not in
  the live catalog.

### Commands / pass-fail (historical)

```bash
npm run test:paid-useful-jobs
```

**PASS** — 22 tests, 0 fail (`node --test server/paid-useful-jobs/test/*.test.mjs`).

Literal journey: `server/paid-useful-jobs/README.md`.

Seeded fail-closed: SAMPLE/`--example` as live sale; missing required input;
fixture payload that would settle if the fixture guard were omitted.

### Gaps (historical)

- Live settlement, facilitator, catalog publication, and deploy are out of scope.
- Declared `https://samedaydesk.com/paid-useful-jobs/<id>` URLs are indexing
  hints, not live routes.
- No homepage CSS/brand changes. No new account, chain, queue, or database.
