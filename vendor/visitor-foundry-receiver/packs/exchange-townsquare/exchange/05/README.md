# R2-EXCHANGE-05 — Correction request workflow

Turn failed objective checks into a **minimal amend request** tied to exact artifact paths.
Retains accepted parts; never restarts the whole task.

Reuses EXCHANGE-01 `runAcceptanceChecks`.

```sh
npm run test:r2-exchange-05
node experiments/scale-r2-20260910/exchange/05/src/cli.mjs demo
```
