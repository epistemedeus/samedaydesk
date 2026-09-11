# How to run the W5-D26 price-floor experiment

From `experiments/wave5/d26`, with Node 22, offline, no wallet:

```bash
node bin/price-floor.mjs journey --buyer-class owner-qa
```

You should see JSON with `ok: true`, `certified: true`, `sold: false`,
`offer.proposedPriceUsdc` equal to `0.003000`, and
`offer.publishedToLiveCatalog` equal to `false`.

The command runs the current F08 CLI on caller-supplied
`vendor-budget-impact` files, then `feed-agenda` as a second owner-qa cost
sample. It adds Coinbase CDP usage-based Exact facilitator cost ($0.001 per
onchain settle after the monthly free tier) and a conservative AWS T2/T3
Linux CPU-credit compute model ($0.05 per vCPU-hour, 60 second minimum).
The free tier is not the unit-cost proof.

Local HTTP:

```bash
node bin/price-floor.mjs listen --port 0
# in another process: POST http://127.0.0.1:<port>/experiment
```

Tests:

```bash
node --test --test-concurrency=1 test/*.test.mjs
```

Live settlement, catalog publication, Stripe charges, and facilitator calls
are out of scope. Owner-qa is not independent demand.
