# W3-13 RECEIPT — H02 vendor price/API feed

**Date:** 11 September 2026
**Branch:** `fable/w3-13-h02-vendor-price-feed`
**HEAD:** `2b6952c98a5cf2e54f73b25c03f5bebe0b17e843` on `fable/w3-13-h02-vendor-price-feed`
**Base:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51 useful-jobs public integration)

## What

A SameDayDesk **vendor price/API feed** in `tools/vendor-price-feed/`. It
ingests a `VendorObservation` (original `sourceUrl`, `priorObservationId`,
`unit`, decimal `amount`, `effectiveDate`, `provenance`) into an append-only
local store. Stale vs current is explicit: a chained later observation marks
the older digest `stale` and it is not returned by `list-current`. SAMPLE
cannot be `upstream`.

PR51 `vendor-budget-impact` is the **subject** (price facts as fixtures), not
F14’s Pilot brief. The job is not reimplemented. H3 Neo
`packs/licensed-artifacts/` is not this ledger. F08 paid wrappers are not
edited.

## Live/source checked first

| Probe | Result |
| --- | --- |
| PR51 archive (committed) | 2522418 B, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`, `purchaseAuthority: false`. |
| Engine facts | `samples/pricing/a/before.json` `gpt-4.1-input` value `2.0` unit `USD/1M-tokens`. This feed stores amount as decimal string `"2.0"`. |
| Engine after.json unit change | `grok-4.6-input` `USD/1M-Tokens` is refused here as wrong units. |
| Live extract / seller-integrity-audit | Unchanged (`$0.005` / `$0.01`). This feed refuses live SDS source URLs and `--write-live`. |

No existing `tools/vendor-price-feed/` directory was present.

## Literal journey

```sh
cd tools/vendor-price-feed
node bin/vendor-price-feed.mjs journey --fixture fixtures/ok.json
```

Journey: ingest observation → list current → older digest is `stale` not
current → SAMPLE rejected as upstream.

## Seeded failures

| Fixture | Must reject |
| --- | --- |
| `fixtures/missing-source-url.json` | missing source URL |
| `fixtures/wrong-unit.json` / `fixtures/float-amount.json` | wrong units / float |
| `fixtures/sample-as-upstream.json` | SAMPLE as upstream |
| `fixtures/overwrite-uncoupled.json` after `ok.json` | overwriting history |
| `fixtures/live-sds-extract.json` / `--write-live` | changing live SDS prices |

## Tests

```bash
cd tools/vendor-price-feed
npm test
```

**PASS** — 12 tests, 0 fail (`node --test --test-concurrency=1 test/*.test.mjs`).

Tests are offline `node:test`. They do not deploy, pay, or write secrets.

## Hard stops honored

No deployment, payment, price change, new account, chain, or queue. Homepage
CSS untouched. No secrets. Node 22. SDS brand preserved. F08 / H3 / Wave 1–2
owned directories not edited.
