# W4-commerce-08 RECEIPT — fixture paid-batch reconciler

**Date:** 11 September 2026
**Repo:** `epistemedeus/samedaydesk`
**Branch:** `codex/w4-commerce-08-20260911`
**Base:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545`
**PR:** https://github.com/epistemedeus/samedaydesk/pull/68 (draft)
**Compare:** https://github.com/epistemedeus/samedaydesk/compare/main...codex/w4-commerce-08-20260911
**Owned path:** `tools/paid-batch-reconciler/`
**Next integration owner:** Root

## Source heads

| Pin | SHA | Role |
| --- | --- | --- |
| SDS main / PR51 | `5b97d1b02e786acd1895cfa1508087ae3f7a1545` | useful-jobs catalog + archive |
| F08 `fable/f08-paid-wrappers` | `bae3e7cd5034b21019fb272a99d88db964b831ee` | read-only optional adapter (not on main; not edited) |
| I01 Neo PR54 | `819fa637ecf5e5177c84efc16fcaa18d57017631` | `hashTermsVersion` isolated pin |
| useful-jobs 1.0.0 | sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` (2522418 bytes) | spawned engines |

F08 PR52 tip `aeef964` is RECEIPT-REVIEW only after this pin. Integer `termsVersion` is rejected; golden I01 hash `sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f` reproduced.

## Commands and counts

Node >= 22. Repository `pg` is used only by the Postgres test. Postgres 16 binaries at `/usr/lib/postgresql/16/bin`. No secrets. No live payment.

```bash
node --test tools/paid-batch-reconciler/test/*.test.mjs
# optional F08 pin:
F08_PIN_ROOT=/path/to/samedaydesk@bae3e7cd node --test tools/paid-batch-reconciler/test/*.test.mjs
```

This Cloud run (F08 worktree at `/tmp/sds-f08-pin` + disposable Postgres 16 + `127.0.0.1` HTTP):

**12 pass, 0 fail, 0 skip.**

Without an F08 checkout the `f08-adapter` test skips (11 pass / 1 skip). That skip is missing-sibling, not a fake green.

## Caller journey

```bash
node tools/paid-batch-reconciler/bin/batch.mjs run \
  tools/paid-batch-reconciler/fixtures/batches/partial-vendor-budget.json \
  --out-dir /tmp/paid-batch-partial
```

Two reserved-fixture `vendor-budget-impact` items: ok caller pair + missing `--after`. Ledger: one `completed` / `reserved-fixture`, one `rejected` / `missing-required-inputs`, batch `partial`, `sold` false, both prices labelled fixture `0.02` USDC.

## Seeded-failure coverage

| Seed | Result |
| --- | --- |
| SAMPLE item as sale (plus ok sibling) | `sample-not-a-sale`; sibling completed; batch partial; sold false |
| `--example` + reserved-fixture | `sample-not-a-sale`; sold false |
| live-settle-shaped payload (fixture flags stripped) | `fixture-cannot-live-settle`; sold false |
| `settle: true` | `live-settle-out-of-scope`; sold false |
| item `price: 0.005` or `0.01`, or `publishToLiveCatalog` | `live-price-mutation-refused`; live catalog files unchanged |
| integer `termsVersion` | `invalid_input`; no items sold |

## Evidence classes

| Class | Exercised |
| --- | --- |
| Fixture | reserved-fixture payment, SAMPLE JSON, labelled 0.02 |
| Local-runtime | spawned useful-jobs CLI, POST `/batch` on 127.0.0.1, disposable Postgres 16 with `sold=false` CHECK |
| External acceptance | not claimed |

## Honestly untested

- Live x402 settle, facilitator, catalog publication, hosted deploy
- F08 merged onto SDS main (still draft PR52; consumed via `F08_PIN_ROOT`)
- External customer messages / real spend
- EIN / Neo homepage / merchant signatures (out of ownership)

## Integration note for Root

F08 `runPaidOffers` is still a sequential loop. This ledger is the item-level product. Bind `F08_PIN_ROOT` after PR52 lands; do not copy a second paid-wrapper kernel.
