# R2-EXCHANGE-06 — Cancellation and stale continuation

Portable lifecycle event reducer for requester cancellation, withdrawn proposals, and late results.

**No payments or refunds** — forbidden fields rejected; `paymentActions` always empty.

```sh
npm run test:r2-exchange-06
node experiments/scale-r2-20260910/exchange/06/src/cli.mjs demo
```
