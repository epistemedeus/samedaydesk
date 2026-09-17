# Pre-spend cost assurance (W3-10 / E06)

Lists required tools and accounts and a **decimal-string** USDC cap for a
named unpaid plan. **Does not purchase.** `purchaseAuthorized` is always
`false` in this assignment. `settle` / `prepare` are refused.

F08 owns `server/paid-useful-jobs/`. Live extract `$0.005` (atomic `5000`) and
seller-integrity-audit `$0.01` (atomic `10000`) on Base USDC `eip155:8453`
are recorded, not changed. Money arithmetic uses B04's import shape
(`atomicToDecimal` / `decimalToAtomic`); Neo is not attached here, so the
fixture under `fixtures/b04-price-arithmetic-verifier/` is used.

## Literal journey

```sh
cd tools/pre-spend-cost-assurance
node bin/pre-spend.mjs journey --fixture fixtures/ok.json
```

Plan naming extract + integrity-audit unpaid amounts → cap string `0.015`
USDC → `purchaseAuthorized: false` → a plan that would POST payment is
rejected.

```sh
node bin/pre-spend.mjs assure --plan fixtures/ok-plan.json
node --test --test-concurrency=1 tests/*.test.mjs
```

Does not fetch, pay, deploy, or edit homepage / `server/pricing.js`.
