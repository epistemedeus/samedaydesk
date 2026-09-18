# w921 unpaid SDS 402 amount matrix

Pinned SameDayDesk x402 catalog amounts as an unpaid-only matrix under
`tools/verify-sds`. Each of the 23 origin routes has one HTTP 402 fixture.
Atomic USDC strings are the pin. Display USD is `atomic / 1e6`. Copying
GET `/extract` `5000` onto GET `/scan`, a Bazaar listed amount, a
dollar-scale atomic, or paid evidence labeled unpaid is rejected.

This pack does not pay, checkout, publish, attach neo, or mutate a registry.

```
node tools/verify-sds/w921-402-matrix/cli.mjs --cold
node tools/verify-sds/w921-402-matrix/cold-run.mjs
node tools/verify-sds/w921-402-matrix/cli.mjs --matrix
node tools/verify-sds/w921-402-matrix/cli.mjs --cross-check
node tools/verify-sds/w921-402-matrix/cli.mjs --seeded-failure extract-onto-scan
node tools/verify-sds/w921-402-matrix/cli.mjs --expect-reject copy_extract_onto_scan tools/verify-sds/w921-402-matrix/fixtures/invalid/extract-onto-scan.json
node tools/verify-sds/w921-402-matrix/cli.mjs tools/verify-sds/w921-402-matrix/fixtures/valid/unpaid-402-extract-5000.json
node --test tools/verify-sds/w921-402-matrix/test.mjs
```

`--live`, `--pay`, `--payment`, `--checkout`, `--publish`, `--registry`,
`--refresh`, `--settle`, `--neo`, and `--cdp` are refused (exit 2).

## Amount matrix

Source pin: in-tree `fixtures/presence/catalog/x402.json` (`lastUpdated`
copied into `matrix.json`). `--cold` / `--cross-check` also compare
`client/public/x402/verified.json` amounts for overlapping routes. No live
fetch.

| Atomic | Display USDC | Example routes |
| --- | --- | --- |
| `2000` | `0.002` | `/chain/transaction-receipt` |
| `5000` | `0.005` | `/extract`, `/read`, `/commerce/payment-offer-preflight` |
| `10000` | `0.01` | `/commerce/seller-integrity-audit` |
| `20000` | `0.02` | `/defi/morpho-position` |
| `50000` | `0.05` | `/enrich`, `/work/opportunity-preflight` |
| `100000` | `0.1` | `/defi/morpho-protection` |
| `200000` | `0.2` | `/scan` |
| `250000` | `0.25` | `/schemaforge`, `/deep-audit` |

Naive verdict is `statusClass === "unpaid"` → accept. Honest verdict joins
the fixture amount to the matrix. The designated seed is naive-accept /
honest-reject.

## Seeded failure

`fixtures/invalid/extract-onto-scan.json` copies an unpaid `/scan` 402 and
writes extract amount `5000`. Catalog pin for `/scan` is `200000`. Compare
as strings. Do not convert `200000` to `0.20`.

```
node tools/verify-sds/w921-402-matrix/cli.mjs --seeded-failure extract-onto-scan
```

Exit 1, `error.code` `SEED_REJECT`, `codes` includes `copy_extract_onto_scan`
and `amount_mismatch`.

Secondary seed `stale-listed-amount`: Bazaar listed `/read` amount `50000`
vs catalog `5000`.

Other rejects in the pack: `wrong_units` (5000-as-dollars and decimal-as-atomic),
`amount_mismatch`, `paid_as_unpaid`, `live_price_edit`.
