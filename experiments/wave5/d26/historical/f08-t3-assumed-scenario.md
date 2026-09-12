# Historical assumed scenario (F08 0.003 / T3 60s)

This file preserves the stage-1 D26 report collected at
`0f4066ca31040c8ba61fb101a4e2653f2ffa573f` (PR 95). It is **not** a measured
Railway cost for live `POST /lockfile-pin-delta` at 5000 atomic USDC.

That live route is merchant `epistemedeus/x402-url-extractor`
`ca38205279f0d543515b81b7261909e55ea2600f` version 1.23.47. It is not the
F08 `vendor-budget-impact` wrapper priced at 0.003.

## What was claimed then

- Job: F08 `vendor-budget-impact` plus confirm `feed-agenda` through SDS PR52
  wrappers at `aeef964fa188443078958d9d6d393afae1d542ee`
- Proposed price: `0.003000` USDC (3000 atomic)
- Floor: `0.001834` USDC = CDP usage-based `0.001000` + 60s T2/T3 Linux
  CPU-credit model `0.000834`
- Measured wall on the VM was ~220ms. Billing used the documented AWS
  On-Demand **60 second minimum**, not Railway per-second use, and not a 60s
  average.
- Stripe US domestic card `2.9% + $0.30` on `0.003` is loss-making.
- Journey JSON had `certified=true` and `nonLossmaking=true` for that
  assumed scenario only.

Replay:

```bash
node bin/price-floor.mjs journey --buyer-class owner-qa
```

The JSON now labels `historicalAssumedScenario=true`,
`liveLockfileOffer=false`, `computeModelIsNotRailway=true`. Do not treat
those flags as a live 0.005 no-loss proof.
