# Agensi listing package (S109)

Provider-neutral, **offline** package for a draft paid-skill offer. It does **not** list, authenticate, or spend.

Encodes:

1. **Listing checklist** — `listing-checklist.json` (ZIP+SKILL.md, $5 min, 70/30, payout rails, ToS 6.3 attribution).
2. **Cloudflare Access handoff for Root** — `access-handoff.json` (GitHub IdP on `www.agensi.dev/sell`).
3. **Sanitized offer descriptor** — `offer-descriptor.json` citing public recipes at `epistemedeus/x402-data-gateway-skills@82d0f019713c7223898806144da08fdbeed5c666` **without claiming proprietary ownership** of those free recipes.

`package.json` script `validate` checks the descriptor against `offer-descriptor.schema.json` with a local JSON Schema subset engine (no network `$ref`, no Agensi SDK).

## Run (from repository root)

```bash
node experiments/s109-marketplace-entry-trials/surfaces/agensi/package/bin/validate-descriptor.mjs
node experiments/s109-marketplace-entry-trials/surfaces/agensi/package/bin/checklist.mjs
npm --prefix experiments/s109-marketplace-entry-trials/surfaces/agensi/package test
```

From this directory:

```bash
npm run validate
npm test
```

## Boundary

- Cash $0; this package never lists, pays, or authenticates.
- Stripe Connect / Zoneless USDC-on-Solana **account eligibility** remains unverified until Root completes Access (and/or an agensi.io creator session).
- Public ToS text on `www.agensi.io` is not an enabled-payout proof.
- Private account IDs, cookies, and payout wallets must not be added to this overlay.
- Upstream recipes stay public; this overlay is Apache-2.0 and does not relicense them.
