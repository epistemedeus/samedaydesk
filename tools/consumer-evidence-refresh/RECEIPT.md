# F07 RECEIPT — consumer evidence refresh

**Date:** 11 September 2026
**Branch:** `fable/w2-09-f07-consumer-evidence-refresh`
**HEAD:** `a3b7101` on `fable/w2-09-f07-consumer-evidence-refresh`
**Base:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51 useful-jobs public integration; includes PR50)

## What

A customer-owned redacted case is re-run against SDS PR50 evidence packages.
Refresh emits a new evidence bundle id + digest bound to the case digest.
Original case bytes are not copied into public outputs. SAMPLE / `--example`
cannot become `customer_owned: true`. Unknown freshness stays `unknown`.

## Source vs brief

- PR50 merge pin `5913534f7a850c8346e5f95b912a3eb3777d3517` is on `main`.
- Archive re-checked on this workspace: `client/public/kit/s178-consumer-repeat-kit.tgz`
  is **718948** bytes, SHA256 `04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d`
  (matches `client/public/kit/s178-consumer-repeat-archive.sha256.json` and
  `experiments/s227-consumer-public-acquisition/` pins).
- Evidence job engines are **not** unpacked under `experiments/s137-*` on SDS
  `main`. They live inside that published archive. This tool extracts and
  invokes `node bin/s178-cli.mjs run <artifactId>`.
- `tools/evidence-records/` has no `consumer_refresh` `sourceKind`. This tool
  reuses completeness `unknown`, `authorityClass: seller_observed`, and the
  required prohibited inferences. It does not fork a second evidence language
  or extend the v1 sourceKind enum.
- Wave 1 F07 (`packs/outside-operator-journey-harness/`) is a different Neo
  harness and was not touched. F08 `server/paid-useful-jobs/` and F14 Pilot
  docs were not edited.
- PR51 `vendor-budget-impact` is an optional **input class** (customer
  quantities) via the committed useful-jobs archive. F08 wrappers are not
  imported or reimplemented.

## Commands / pass-fail

```bash
npm run test:consumer-evidence-refresh
```

**PASS** — 21 tests, 0 fail (`node --test --test-concurrency=1 tools/consumer-evidence-refresh/test/*.test.mjs`).

Literal journey: `tools/consumer-evidence-refresh/README.md`.

Seeded fail-closed: email / token / `Bearer `; SAMPLE labelled customer-owned;
writing the case to a public catalog path; changing live SDS prices; treating
refresh as a paid sale / settlement.

## Gaps

- Live settlement, catalog publication, and deploy are out of scope.
- No homepage CSS/brand changes. No new account, chain, queue, or database.
- A current/stale freshness label requires a successful `freshness-receipt`
  engine disposition. This fixture journey does not claim current.
