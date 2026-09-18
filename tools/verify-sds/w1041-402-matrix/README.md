# w1041-402-matrix

SameDayDesk unpaid HTTP **402 amount matrix** (wave w1041).

Cold-reads the committed origin catalog `fixtures/presence/catalog/x402.json` (23 routes, 8 unique USDC amounts). Display USD is `atomic / 1e6`. Does not pay, checkout, publish, or attach neo.

| Field | Value |
| --- | --- |
| origin | `https://agents.samedaydesk.com` |
| routes | 23 |
| unique amounts | 2000, 5000, 10000, 20000, 50000, 100000, 200000, 250000 |
| network | `eip155:8453` |
| asset | Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| payTo | `0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee` |
| designated seed | Bazaar `/read` listed `50000` vs catalog `5000` |

## Commands

```bash
node tools/verify-sds/w1041-402-matrix/cli.mjs --cold
node tools/verify-sds/w1041-402-matrix/cli.mjs --seeded-failure stale-listed-amount
node tools/verify-sds/w1041-402-matrix/cli.mjs --expect-reject stale_listed_amount tools/verify-sds/w1041-402-matrix/fixtures/seeded/stale-listed-amount.json
node tools/verify-sds/w1041-402-matrix/cli.mjs tools/verify-sds/w1041-402-matrix/fixtures/ok/unpaid-402-extract-5000.json
node tools/verify-sds/w1041-402-matrix/cli.mjs --suite
node tools/verify-sds/w1041-402-matrix/cli.mjs run
node tools/verify-sds/w1041-402-matrix/run-harness.mjs
node --test tools/verify-sds/w1041-402-matrix/cli.test.mjs
```

`--cold` exit 0 means: catalog matches the w1041 pin, OpenAPI display amounts match `atomic/1e6` on the same method+route, and the known Bazaar stale listings are **detected** (not treated as catalog). Catalog amounts are not rewritten.

`--seeded-failure stale-listed-amount` exit 1, `error.code` `SEED_REJECT`. Naive rule `statusClass === "unpaid"` would accept. Honest rule rejects `stale_listed_amount`.

## Boundaries

- Write only: `tools/verify-sds/w1041-402-matrix/**`
- Cite-only W7 PR179 `tools/commerce-receipts/amount-matrix-w7/**` (never edit)
- Never Stripe/x402 pay; never `--live` / `--neo` / `--publish`
- HTTP 402 is not settlement
