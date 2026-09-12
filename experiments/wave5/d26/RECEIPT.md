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

Keep **$0.005 / 5000 atomic**. Production facilitator is **cdp** (source
default remains xpay). Official CDP schedule still applies: verify free;
first 1000 onchain txs/month free, then $0.001. Remaining CDP free-tier
quota and account balance were not read and are not claimed. Unit-marginal
after unread free-tier is CDP $0.001 plus this-VM Railway ceil, which 5000
atomic covers. Allocated idle (~$1.76/30d this-VM RSS, shared with
`EXTRACT_BATCH_ENABLED=1`) is a separate shared-process cost and is not
project profit. Local mean ~48ms is not production latency. Local timeout
HTTP 503 settle 0 is not CDP fee proof. No-loss is still not proven. Do
not change the price. This is for a bounded launch decision, not a profit
guarantee.

This-VM serial successes on the mounted handler were ~38–74ms wall (mean
~48ms). H04 large (72KiB) was ~51ms. Near-128KiB admitted lockfile was
~41ms. None of that approaches the 5000ms worker ceiling. Timeout with
`WORKER_HOLD_MS=6000` was ~5065ms wall, HTTP 503, settle 0. Yarn/HTML/path
and oversize cases refused in ~1–3ms with settle 0. Failed and refused
settle counts were zero (`execute-before-settle`). Those rows were not
recollected for this binding.

Concurrency against uniquified b04 bodies (not a loadtest): wave wall
1-way ~39ms (settle 1), 6-way ~96ms (settle 6), 12-way ~178ms (settle 12).
Peak RSS rose from ~189MB idle to ~401MB at 12-way.

Per-request Railway CPU+RAM on this VM ceils to 1 USDC atomic. That is
attribution, not a Railway invoice. Merchant **source** default remains
**xpay** (fee unknown, not production). Production Railway allowlist
observed 2026-09-12 ~02:00 UTC is `FACILITATOR=cdp`,
`EXTRACT_BATCH_ENABLED=1`, `LOCKFILE_PIN_DELTA_ENABLED=1`. Idle replica
RAM on this process (~189MB) attributes to about $0.0024/hour or
~$1.76/30d at official per-second memory rates. Railway plan and included
credits are unknown and are not unit cost.

What must still be measured before saying no-loss is listed on
`measured/recommendation.json`. Timeout 5000ms is a ceiling, not an
average; H04 walls here do not justify changing it.

Replayable artifacts: `measured/profile.json`, `measured/profile.csv`,
`measured/environment.json`, `measured/source-export.json`. Rebind without
remount: `node bin/price-floor.mjs rebind-measured`.

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

Tests: **32 pass, 0 fail** (`node --test --test-concurrency=1 test/*.test.mjs`).

## pstack / model

- Run model field: `cursor-grok-4.6-xhigh`
- Marketplace plugin `9717366` pin `68d834d9ca8f34c375ecb8057bfbcde5396a01f8`
- No additional Cloud agents spawned
- Railway: https://railway.com/pricing.md and https://docs.railway.com/reference/pricing/plans (2026-09-12)
- CDP: https://docs.cdp.coinbase.com/x402/core-concepts/facilitator (2026-09-12)
