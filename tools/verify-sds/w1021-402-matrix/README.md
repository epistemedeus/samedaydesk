# w1021 SDS 402 matrix

Unpaid-only SameDayDesk x402 amount matrix. Pins all 23 origin catalog
routes (8 unique atomic USDC amounts) from committed
`fixtures/presence/catalog/x402.json`. Display USD is `atomic / 1e6`.
HTTP 402 is not settlement. A Bazaar listed `/read` amount `50000` vs
catalog `5000` is `stale_listed_amount`. Atomic `5000` claimed as `$5000`
is `wrong_units`. Paid evidence labeled unpaid is `paid_as_unpaid`.

This slice does not pay, checkout, publish, attach neo, fetch live, or
edit catalog prices.

```
node tools/verify-sds/w1021-402-matrix/bin/prove.mjs --json
node tools/verify-sds/w1021-402-matrix/bin/prove.mjs --seeded-failure stale-listed-amount --json
node tools/verify-sds/w1021-402-matrix/bin/prove.mjs suite --json
node tools/verify-sds/w1021-402-matrix/bin/prove.mjs matrix --json
node tools/verify-sds/w1021-402-matrix/bin/prove.mjs --expect-reject stale_listed_amount tools/verify-sds/w1021-402-matrix/fixtures/seeded/stale-listed-amount.json
node --test tools/verify-sds/w1021-402-matrix/test/*.test.mjs
```

`--live`, `--pay`, `--payment`, `--checkout`, `--publish`, `--registry`,
`--refresh`, `--settle`, and `--neo` are refused (exit 2).

## Amount matrix

Source pin: in-tree `fixtures/presence/catalog/x402.json` (`lastUpdated`
copied into `PIN.json` and `matrix.json`). Cold prove compares the matrix
to that file. No live fetch.

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
the fixture amount to the catalog matrix. The designated seed is
naive-accept / honest-reject.

## Seeded failure

`fixtures/seeded/stale-listed-amount.json` copies an unpaid `/read` 402
and writes the Bazaar listed amount `50000` (display `0.05`). Catalog pin
for `/read` is `5000` (`0.005`).

```
node tools/verify-sds/w1021-402-matrix/bin/prove.mjs --seeded-failure stale-listed-amount --json
```

Exit 1, `error.code` `SEED_REJECT`, `codes` includes `stale_listed_amount`.

Other rejects in the pack: `wrong_units`, `amount_mismatch`,
`paid_as_unpaid`, `live_price_edit`, `silent-empty-success`.
