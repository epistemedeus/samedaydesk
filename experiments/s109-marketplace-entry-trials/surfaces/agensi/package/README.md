# Agensi listing checklist (S109)

Offline validator for a **draft** paid-skill offer. Cloudflare Access blocks anonymous `/sell` reads.

## Run (from repository root)
```bash
node experiments/s109-marketplace-entry-trials/surfaces/agensi/package/bin/checklist.mjs
npm --prefix experiments/s109-marketplace-entry-trials/surfaces/agensi/package test
```

## Boundary
- Cash $0; this package never lists, pays, or authenticates.
- Stripe / Solana USDC eligibility remains **unverified** until Root completes Access.
- Private account IDs must not be added to this public overlay.
