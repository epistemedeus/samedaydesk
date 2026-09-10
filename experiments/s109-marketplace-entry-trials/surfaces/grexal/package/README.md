# Grexal evidence-agent scaffold (S109)

Dry `grexal.json` (manifest_version 3) + offline fee worksheet. **No publish, no auth, no spend.**

## Run (from repository root)
```bash
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/validate-manifest.mjs
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/fee-worksheet.mjs 0.10
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/agent/pack_evidence.mjs --repoPath . --baseRef HEAD --headRef HEAD
npm --prefix experiments/s109-marketplace-entry-trials/surfaces/grexal/package test
```

## Offer framing
- Paid delta (if Root later publishes): packaging git diffs into an acceptance report for buyers.
- Free alternative: local `git diff` + manual notes; public gateway recipes remain free upstream.
- Marketplace name/pricing/visibility are **not** in `grexal.json` (dashboard / `grexal agent set-*`).

Primary fee docs: https://docs.grexal.ai/docs/payments
