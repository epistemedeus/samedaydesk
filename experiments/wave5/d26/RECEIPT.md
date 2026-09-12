# W5-D26 receipt

Assignment `W5-D26` on `epistemedeus/samedaydesk`. Cost/price-floor kit for
the live lockfile route, plus a labelled historical F08 assumed scenario.

## Return

- Repo: `epistemedeus/samedaydesk`
- Branch: `cursor/w5-d26-exact-service-cost-price-floor-experiment-using-current-implementation-d554`
- Head: tip of this branch after push
- Compare: https://github.com/epistemedeus/samedaydesk/compare/fable/f08-paid-wrappers...cursor/w5-d26-exact-service-cost-price-floor-experiment-using-current-implementation-d554
- PR (draft): https://github.com/epistemedeus/samedaydesk/pull/95
- Owned path: `experiments/wave5/d26/` only

## Live offer under test (not a price change)

- Merchant: `epistemedeus/x402-url-extractor@ca38205279f0d543515b81b7261909e55ea2600f` version 1.23.47
- Route: `POST /lockfile-pin-delta` at **5000 atomic USDC ($0.005)**, x402-only, Railway
- This is not the historical F08 `vendor-budget-impact` wrapper at 0.003
- Handler is spawned from a disposable worktree with an injectable fake facilitator
- Corpus: SDS H04 `7026dc9ad4bc9bef6c68cf0654fff5a6d2c54bbc` public lockfile pairs
- No public endpoint load, live payment, credentials, or merchant source writes

## Compact recommendation for current 0.005

Keep **$0.005 / 5000 atomic**. Do not change the price from this kit. Do not
claim no-loss.

Per-request Railway CPU+RAM on this VM is far below 5000 atomic (per-second
rates, no 60s minimum). That is attribution, not a Railway invoice. Default
merchant facilitator is **xpay** (fee unknown). CDP $0.001/onchain settle
applies only if production is `FACILITATOR=cdp`. Failed and refused attempts
must not settle (`execute-before-settle`); they still burn compute. Idle
replica RAM is the likely dominant allocated cost and is unmeasured in
production. Railway plan and included credits are unknown and are not unit
cost.

What must still be measured before saying no-loss is listed on
`measured/recommendation.json`. Timeout 5000ms is a ceiling, not an average.

## Historical assumed scenario (preserved, not current)

See `historical/f08-t3-assumed-scenario.md`. Journey still emits
`certified=true` for the F08 0.003 T3/60s model, now labelled
`historicalAssumedScenario=true` / `liveLockfileOffer=false`. That is not a
measured Railway cost for the live lockfile offer.

## Tests

```bash
cd experiments/wave5/d26 && node --test --test-concurrency=1 test/*.test.mjs
```

Also: `node bin/price-floor.mjs profile` writes `measured/`.

## pstack / model

- Run model field: `cursor-grok-4.6-xhigh`
- Marketplace plugin `9717366` pin `68d834d9ca8f34c375ecb8057bfbcde5396a01f8`
- No additional Cloud agents spawned
- Railway: https://railway.com/pricing.md and https://docs.railway.com/reference/pricing/plans (2026-09-12)
- CDP: https://docs.cdp.coinbase.com/x402/core-concepts/facilitator (2026-09-12)
