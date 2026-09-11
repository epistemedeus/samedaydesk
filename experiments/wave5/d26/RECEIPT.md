# W5-D26 receipt

Assignment `W5-D26` on `epistemedeus/samedaydesk`. Stage-1 kit against current SDS PR52 wrappers.

## Return

- Repo: `epistemedeus/samedaydesk`
- Branch: `cursor/w5-d26-exact-service-cost-price-floor-experiment-using-current-implementation-d554`
- Head: branch tip (do not embed a SHA that the next commit would invalidate)
- Compare: https://github.com/epistemedeus/samedaydesk/compare/fable/f08-paid-wrappers...cursor/w5-d26-exact-service-cost-price-floor-experiment-using-current-implementation-d554
- PR (draft): https://github.com/epistemedeus/samedaydesk/pull/95
- Owned path: `experiments/wave5/d26/` only

## Tests

```bash
cd experiments/wave5/d26 && node --test --test-concurrency=1 test/*.test.mjs
```

Node v22.14.0. **22 pass, 0 fail, 0 skipped, 0 todo.** Suites: HTTP, journey/CLI, live prices, money units, seeded refusals.

Also executed `node bin/price-floor.mjs journey --buyer-class owner-qa`. Result: `ok=true`, `certified=true`, `nonLossmaking=true`, `sold=false`, `publishedToLiveCatalog=false`.

Postgres was not used. The claim is F08 CLI/HTTP process cost plus documented fee schedules. Missing Postgres is not a skipped green gate.

## Current-source pins

- SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee` (`fable/f08-paid-wrappers`). Consumed `server/paid-useful-jobs` CLI. Not rewritten.
- Pilot packet `95b3f3a47f5b1b69bd237e4c978fc3376221365d`.
- W4-commerce-16 `aa306e291adfdd499ca971af01625ccc4bfee5c4` (PR 72) read-only. Not vendored.

## Proposed offer (not live)

- Job: `vendor-budget-impact` on caller files through current F08 CLI
- Confirm sample: `feed-agenda` (owner-qa, not D25 acceptance)
- Rail: x402 Exact USDC Base `eip155:8453`
- Proposed price: `0.003000` USDC (3000 atomic)
- Floor: `0.001834` USDC = CDP usage-based `0.001000` + 60s T2/T3 Linux CPU-credit model `0.000834`
- Distinct from live extract `0.005`, seller-integrity-audit `0.01`, fixture `0.02`
- Stripe US domestic card `2.9% + $0.30` on `0.003` is `0.300087` fees, floor `0.300921`, loss-making. That rail cannot certify this x402 offer.
- CDP free tier is capacity, not the unit-cost proof
- Measured wall time on this VM was ~220ms for the primary job. Billing uses the documented 60s On-Demand minimum, not this VM's invoice.

## Remaining integration bindings

- W5-D01 supplied-input contract export is not on this branch. Tested F08 at SDS PR52.
- W5-D25 buyer-journey harness is not on this branch.
- Live settlement, catalog publication, facilitator calls, and spend were not performed.

## Live steps still held by Root or the journey owner

1. Bind D01's exported contract if F08 CLI/library shape changes, then replay `node bin/price-floor.mjs journey --buyer-class owner-qa`.
2. Replace the two F08 owner-qa jobs with D25's public-interface harness when that path exists.
3. Field settlement and catalog publication stay out of this kit. Do them only with funds and authority Root already holds.
4. M12 can read this floor. It must not treat `0.003` as a live catalog price until someone publishes it.

## pstack / model

- Run model field: `cursor-grok-4.6-xhigh` (`https://cursor.com/agents/bc-ee7b32a9-9ad2-4a7e-99fa-26989c3dafad`)
- Marketplace plugin `9717366` pin `68d834d9ca8f34c375ecb8057bfbcde5396a01f8`
- Skills actually read: poteto-mode principles index, principle-build-the-lever, principle-model-the-domain, principle-test-behavior-not-implementation, principle-prove-it-works, principle-laziness-protocol, show-me-your-work, figure-it-out, unslop, technical-writing, stripe-docs, setup-pstack
- No `~/.cursor/rules/pstack-models.mdc` on this VM
- Stripe MCP `needsAuth`. `stripe docs` CLI absent. Fee quote from https://stripe.com/pricing (2026-09-11)
- CDP quote from https://docs.cdp.coinbase.com/x402/core-concepts/facilitator (2026-09-11)
- No additional Cloud agents spawned
