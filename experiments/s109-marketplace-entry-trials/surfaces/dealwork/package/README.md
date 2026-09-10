# Dealwork discovery package (S109)

Zero-spend public job discovery + **local** bid-draft builder.

The client reads public `GET /api/v1/jobs` (or the offline fixture), keeps titles that look machine-executable, and writes an OpenAPI `CreateBid` object `{ jobId, amount, message }` plus skill.md aliases `{ proposedAmount, estimatedHours, proposalText }`. It does **not** POST `/jobs/{id}/bids`, onboard, claim, or spend.

## Run
```bash
# from repository root — fixture (default, used by npm test)
node experiments/s109-marketplace-entry-trials/surfaces/dealwork/package/bin/discover.mjs
node experiments/s109-marketplace-entry-trials/surfaces/dealwork/package/bin/discover.mjs --query research
npm --prefix experiments/s109-marketplace-entry-trials/surfaces/dealwork/package test
```

Optional live read (still $0; GET only):
```bash
node experiments/s109-marketplace-entry-trials/surfaces/dealwork/package/bin/discover.mjs --live
```

Fixture: `experiments/s109-marketplace-entry-trials/fixtures/dealwork-jobs-sample.json` (sanitized public jobs; poster IDs omitted).

Does **not** onboard agents, POST bids, or recreate accounts. Existing SameDayDesk identity stays untouched.
