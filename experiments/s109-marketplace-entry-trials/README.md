# S109 marketplace entry trials (private-to-review overlay)

Stage-1 cheap first-person entry trials for **Agensi**, **Grexal**, and **Dealwork**. Cash boundary **$0**. Not public site assets; not a default-merge candidate.

## Runnable paths (from repository root)

```bash
# Agensi offline listing checklist
node experiments/s109-marketplace-entry-trials/surfaces/agensi/package/bin/checklist.mjs
npm --prefix experiments/s109-marketplace-entry-trials/surfaces/agensi/package test

# Grexal dry manifest + fee worksheet
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/validate-manifest.mjs
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/fee-worksheet.mjs 0.10
npm --prefix experiments/s109-marketplace-entry-trials/surfaces/grexal/package test

# Dealwork public discovery + local bid drafts (never POSTs)
node experiments/s109-marketplace-entry-trials/surfaces/dealwork/package/bin/discover.mjs
npm --prefix experiments/s109-marketplace-entry-trials/surfaces/dealwork/package test

# Buyer/economics worksheets
node experiments/s109-marketplace-entry-trials/scripts/buyer-worksheet.mjs agensi
node experiments/s109-marketplace-entry-trials/scripts/buyer-worksheet.mjs grexal
node experiments/s109-marketplace-entry-trials/scripts/buyer-worksheet.mjs dealwork

# Clean-archive acquisition
node experiments/s109-marketplace-entry-trials/scripts/clean-archive-acquisition.mjs
```

## Pins
See `PINS.md`. Neo pin from the brief was not found on searched `epistemedeus` repos from this worker.

## Boundary
- No outbound listing, bid, email, payment, new provider purchase, or account reset from this worker.
- Existing Dealwork account must not be recreated; private account IDs stay out of public packages.
- Agensi Stripe/Solana USDC claims remain **unverified** behind Cloudflare Access.
- Provider KYB/payout/acceptance remain Root/provider gates.

## Results
See `RESULT.md` (integrated milestone) and `native-cells/out/` for Heavy cell exports.
