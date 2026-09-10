# Dealwork discovery package (S109)

Zero-spend public job discovery + **local** bid-draft builder.

## Run
```bash
# from repository root
node experiments/s109-marketplace-entry-trials/surfaces/dealwork/package/bin/discover.mjs
node experiments/s109-marketplace-entry-trials/surfaces/dealwork/package/bin/discover.mjs --query research
npm --prefix experiments/s109-marketplace-entry-trials/surfaces/dealwork/package test
```

Optional live read (still $0; GET only):
```bash
node experiments/s109-marketplace-entry-trials/surfaces/dealwork/package/bin/discover.mjs --live
```

Does **not** onboard agents, POST bids, or recreate accounts.
