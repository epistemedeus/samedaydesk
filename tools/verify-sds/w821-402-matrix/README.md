# w821 SDS unpaid 402 matrix

Pinned SameDayDesk x402 catalog amounts as an unpaid-only HTTP 402 matrix
under `tools/verify-sds/w821-402-matrix`. Each of the 23 origin routes has
one unpaid 402 fixture. Atomic USDC strings are the pin. Display USD is
`atomic / 1e6`. A Bazaar listed amount, a non-402 status labeled unpaid, or
a forged settlement object is rejected.

This pack does not pay, checkout, publish, attach neo, or mutate a registry.
It does not fetch the live catalog. `--cross-check` reads in-tree
`fixtures/presence/catalog/x402.json` only.

```
node tools/verify-sds/w821-402-matrix/cli.mjs --cold
node tools/verify-sds/w821-402-matrix/cli.mjs --suite
node tools/verify-sds/w821-402-matrix/cli.mjs --matrix
node tools/verify-sds/w821-402-matrix/cli.mjs --cross-check
node tools/verify-sds/w821-402-matrix/cli.mjs --seeded-failure all
node tools/verify-sds/w821-402-matrix/cli.mjs --seeded-failure bad-amount
node tools/verify-sds/w821-402-matrix/cli.mjs --seeded-failure bad-status
node tools/verify-sds/w821-402-matrix/cli.mjs --seeded-failure forged-settle
node tools/verify-sds/w821-402-matrix/cli.mjs --expect-reject stale_listed_amount tools/verify-sds/w821-402-matrix/fixtures/invalid/stale-listed-amount.json
node tools/verify-sds/w821-402-matrix/cli.mjs tools/verify-sds/w821-402-matrix/fixtures/valid/unpaid-402-extract-5000.json
node --test tools/verify-sds/w821-402-matrix/test.mjs
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
the fixture amount and status to the matrix. Designated seeds are
naive-accept / honest-reject.

## Seeded failures

`--seeded-failure all` runs the three designated seeds and exits 1 with
`error.code` `SEED_REJECT` when each is caught. If a designated seed is
accepted or misses its code, the CLI exits 2 with `SEED_MISS` / `SEED_ACCEPTED`.

| Seed | Fixture | Honest code |
| --- | --- | --- |
| `bad-amount` | `fixtures/invalid/stale-listed-amount.json` | `stale_listed_amount` |
| `bad-status` | `fixtures/invalid/http-200-as-unpaid.json` | `bad_status` |
| `forged-settle` | `fixtures/invalid/forged-settle.json` | `forged_settle` |

`bad-amount` copies an unpaid `/read` 402 and writes the Bazaar listed
amount `50000` (display `0.05`). Catalog pin for `/read` is `5000`
(`0.005`). Documented in `docs/lqdist1-distribution-audit/per-route-table.json`
as Agent402 priceConflict: bazaar 0.05 vs origin/live 0.005.

`bad-status` labels HTTP 200 as an unpaid 402.

`forged-settle` copies a facilitator settlement transaction onto an unpaid
HTTP 402. This pack never settles.

Other rejects in the pack: `wrong_units` (5000-as-dollars and decimal-as-atomic),
`amount_mismatch`, `paid_as_unpaid`, `live_price_edit`.
