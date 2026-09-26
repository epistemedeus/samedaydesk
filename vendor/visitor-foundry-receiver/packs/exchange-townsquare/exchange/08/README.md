# R2-EXCHANGE-08 — Journey + gates + acquisition/correction (follow-on)

Composes **01–07** with:

1. **Package acquisition preflight** (local verify-before-continue)
2. **Proposal + admission gates** (stop before deliver on unsafe/unsupported)
3. **Request→correction** CLI (`demo-correct`)

```sh
node experiments/scale-r2-20260910/exchange/08/src/cli.mjs preflight
node experiments/scale-r2-20260910/exchange/08/src/cli.mjs demo
node experiments/scale-r2-20260910/exchange/08/src/cli.mjs demo-gate
node experiments/scale-r2-20260910/exchange/08/src/cli.mjs demo-correct
npm run test:r2-exchange-08
```

S151 review pin `17236cd` on `codex/r2-exchange-08-20260910` stays read-only.
