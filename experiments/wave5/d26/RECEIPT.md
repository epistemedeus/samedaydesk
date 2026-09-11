# W5-D26 receipt

Assignment `W5-D26` on `epistemedeus/samedaydesk`. Stage-1 kit against current SDS PR52 wrappers.

## Return

- Repo: `epistemedeus/samedaydesk`
- Branch: `cursor/w5-d26-exact-service-cost-price-floor-experiment-using-current-implementation-d554`
- Head: pending this commit
- Owned path: `experiments/wave5/d26/` only
- Tests: pending first execution after this revision

## Current-source pins

- SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee` (`fable/f08-paid-wrappers`). Consumed `server/paid-useful-jobs` CLI/library. Not rewritten.
- Pilot packet `95b3f3a47f5b1b69bd237e4c978fc3376221365d` `overview/research/cursor-wave5-20260911/{PLAN.md,REVIEW-INTEGRATION.md,TASKS.json}`.
- W4-commerce-16 `aa306e291adfdd499ca971af01625ccc4bfee5c4` (PR 72) read-only. Duration/label honesty reused. Source not vendored.

## Proposed offer (not live)

- Job: `vendor-budget-impact` through current F08 CLI on caller files
- Rail: x402 Exact USDC on Base (`eip155:8453`)
- Price: `0.003` USDC (3000 atomic). Distinct from live extract `0.005`, seller-integrity-audit `0.01`, and fixture `0.02`
- Floor model: CDP usage-based `$0.001` per onchain Exact settle after the 1000 tx/month free tier, plus AWS T2/T3 Unlimited Linux `$0.05` per vCPU-hour with a 60 second On-Demand minimum
- Free tier is recorded as capacity, not the unit-cost proof
- Stripe US domestic card `2.9% + $0.30` on `0.003` is a labelled counterfactual and is loss-making
- `sold`, `publishedToLiveCatalog`, `purchaseAuthority`, `independentDemand` stay false

## Remaining integration bindings

- W5-D01 supplied-input contract export is not on this branch. This kit tested F08 at SDS PR52.
- W5-D25 buyer-journey harness is not on this branch. Two owner-qa F08 jobs are a current-interface stand-in, not D25 acceptance.
- Live settlement, catalog publication, facilitator calls, and spend were not performed.

## pstack / model

- Run model field: `cursor-grok-4.6-xhigh`
- Marketplace plugin `9717366` pin `68d834d9ca8f34c375ecb8057bfbcde5396a01f8`
- Skills actually read: poteto-mode principles index, principle-build-the-lever, principle-model-the-domain, principle-test-behavior-not-implementation, principle-prove-it-works, principle-laziness-protocol, show-me-your-work, figure-it-out, unslop, technical-writing, stripe-docs, setup-pstack
- No `~/.cursor/rules/pstack-models.mdc` on this VM
- Stripe MCP `needsAuth`. `stripe docs` CLI absent. Fee quote taken from https://stripe.com/pricing
- CDP quote from https://docs.cdp.coinbase.com/x402/core-concepts/facilitator
- No additional Cloud agents spawned
