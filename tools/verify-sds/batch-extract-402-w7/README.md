# W7 SDS batch-extract 402 amount gate

Unpaid-only SameDayDesk `POST /extract/batch` HTTP 402 amount gate under
`tools/verify-sds/batch-extract-402-w7`. Native pin is **10000 atomic Base
USDC** (`0.01` display) as a **flat 1–5 URL attempt** quote. That is not
`GET /extract` (`5000` / `0.005` in `fixtures/presence/catalog/x402.json`).
`POST /extract/batch` is absent from that 23-item catalog.

This pack does not pay, checkout, publish, attach neo, or mutate a registry.
It does not fetch the live catalog. `--cross-check` reads in-tree llms.txt,
quote fixtures, cost notes, and `x402.json` only.

```
node tools/verify-sds/batch-extract-402-w7/cli.mjs --cold
node tools/verify-sds/batch-extract-402-w7/cli.mjs --suite
node tools/verify-sds/batch-extract-402-w7/cli.mjs --matrix
node tools/verify-sds/batch-extract-402-w7/cli.mjs --cross-check
node tools/verify-sds/batch-extract-402-w7/cli.mjs --seeded-failure all
node tools/verify-sds/batch-extract-402-w7/cli.mjs --seeded-failure wrong-amount
node tools/verify-sds/batch-extract-402-w7/cli.mjs --seeded-failure missing-amount
node tools/verify-sds/batch-extract-402-w7/cli.mjs --seeded-failure forged-settlement
node tools/verify-sds/batch-extract-402-w7/cli.mjs --expect-reject wrong_amount tools/verify-sds/batch-extract-402-w7/fixtures/invalid/wrong-amount.json
node tools/verify-sds/batch-extract-402-w7/cli.mjs tools/verify-sds/batch-extract-402-w7/fixtures/valid/unpaid-402-extract-batch-10000-one.json
node --test tools/verify-sds/batch-extract-402-w7/test.mjs
```

`--live`, `--pay`, `--payment`, `--checkout`, `--publish`, `--registry`,
`--refresh`, `--settle`, and `--neo` are refused (exit 2).

## Amount matrix

| Method | Route | Atomic | Display USDC | Role |
| --- | --- | --- | --- | --- |
| `POST` | `/extract/batch` | `10000` | `0.01` | native flat attempt (1–5 URLs) |
| `GET` | `/extract` | `5000` | `0.005` | catalog contrast; not a batch rewrite |

1-URL and 5-URL unpaid fixtures must both carry `10000`. Scaling by URL
count (`25000`, `50000`) is `wrong_amount`.

Naive verdict is `statusClass === "unpaid"` → accept. Honest verdict joins
the fixture amount to the extract/batch pin and rejects missing amount and
forged settlement.

## Seeded failures

| id | fixture | honest code | naive |
| --- | --- | --- | --- |
| `wrong-amount` | `fixtures/invalid/wrong-amount.json` | `wrong_amount` | accept |
| `missing-amount` | `fixtures/invalid/missing-amount.json` | `missing_amount` | accept |
| `forged-settlement` | `fixtures/invalid/forged-settlement.json` | `forged_settlement` | accept |

`wrong-amount` copies an unpaid extract/batch 402 and writes GET `/extract`
amount `5000`. `forged-settlement` attaches the in-tree seller-integrity-audit
facilitator transaction to an unpaid extract/batch 402.

```
node tools/verify-sds/batch-extract-402-w7/cli.mjs --seeded-failure all
```

Exit 1, `error.code` `SEED_REJECT`, all three `caught: true`.
