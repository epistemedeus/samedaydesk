# W7 unpaid SDS amount-matrix fixtures

Pinned SameDayDesk x402 catalog amounts as an unpaid-only matrix. Each of
the 23 origin routes has one HTTP 402 fixture. Atomic USDC strings are the
pin. Display USD is `atomic / 1e6`. A Bazaar listed amount, a dollar-scale
atomic, or paid evidence labeled unpaid is rejected.

This pack does not pay, checkout, publish, attach neo, or mutate a registry.

```
node tools/commerce-receipts/amount-matrix-w7/cli.mjs --suite
node tools/commerce-receipts/amount-matrix-w7/cli.mjs --matrix
node tools/commerce-receipts/amount-matrix-w7/cli.mjs --cross-check
node tools/commerce-receipts/amount-matrix-w7/cli.mjs --seeded-failure stale-listed-amount
node tools/commerce-receipts/amount-matrix-w7/cli.mjs --expect-reject stale_listed_amount tools/commerce-receipts/amount-matrix-w7/fixtures/invalid/stale-listed-amount.json
node tools/commerce-receipts/amount-matrix-w7/cli.mjs tools/commerce-receipts/amount-matrix-w7/fixtures/valid/unpaid-402-extract-5000.json
node --test tools/commerce-receipts/amount-matrix-w7/test.mjs
```

`--live`, `--pay`, `--payment`, `--checkout`, `--publish`, `--registry`,
`--refresh`, `--settle`, and `--neo` are refused (exit 2).

## Amount matrix

Source pin: in-tree `fixtures/presence/catalog/x402.json` (`lastUpdated`
copied into `matrix.json`). `--cross-check` compares the matrix to that
file. No live fetch.

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

`fixtures/invalid/stale-listed-amount.json` copies an unpaid `/read` 402
and writes the Bazaar listed amount `50000` (display `0.05`). Catalog pin
for `/read` is `5000` (`0.005`).

```
node tools/commerce-receipts/amount-matrix-w7/cli.mjs --seeded-failure stale-listed-amount
```

Exit 1, `error.code` `SEED_REJECT`, `codes` includes `stale_listed_amount`.

Other rejects in the pack: `wrong_units` (5000-as-dollars and decimal-as-atomic),
`amount_mismatch`, `paid_as_unpaid`, `live_price_edit`.
