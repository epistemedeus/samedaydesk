# Agensi listing package (S109)

Provider-neutral, **offline** package for a draft paid-skill offer. It does **not** list, authenticate, or spend. Local packager output is not an Agensi paid run, listing, or buyer escrow acceptance.

Encodes:

1. **Listing checklist** — `listing-checklist.json` (ZIP+SKILL.md, $5 min, 70/30, payout rails, ToS 6.3 attribution).
2. **Root seller-entry handoff** — `access-handoff.json`. Official Agensi seller surfaces are `https://www.agensi.io/auth`, `https://www.agensi.io/sell`, and buyer MCP `https://mcp.agensi.io/mcp`. `https://www.agensi.dev` Cloudflare Access is an **unrelated tenant**, not a seller path — do not enter from this worker.
3. **Sanitized offer descriptor** — `offer-descriptor.json` citing public recipes at `epistemedeus/x402-data-gateway-skills@82d0f019713c7223898806144da08fdbeed5c666` **without claiming proprietary ownership** of those free recipes.
4. **Paid-vs-free provenance** — `bin/provenance.mjs` hashes a free recipe tree against a paid packaging directory and reports `packagingDeltaFiles` (paid-only + modified) with `claimsProprietaryOwnershipOfFreeRecipes=false`.

`package.json` script `validate` checks the descriptor against `offer-descriptor.schema.json` with a local JSON Schema subset engine (no network `$ref`, no Agensi SDK).

## Run (from repository root)

```bash
node experiments/s109-marketplace-entry-trials/surfaces/agensi/package/bin/validate-descriptor.mjs
node experiments/s109-marketplace-entry-trials/surfaces/agensi/package/bin/checklist.mjs
node experiments/s109-marketplace-entry-trials/surfaces/agensi/package/bin/provenance.mjs \
  --freeDir experiments/s109-marketplace-entry-trials/s121/fixtures/agensi-free \
  --paidDir experiments/s109-marketplace-entry-trials/s121/fixtures/agensi-paid
npm --prefix experiments/s109-marketplace-entry-trials/surfaces/agensi/package test
```

From this directory:

```bash
npm run validate
npm run provenance -- --freeDir ../../../s121/fixtures/agensi-free --paidDir ../../../s121/fixtures/agensi-paid
npm test
```

## Boundary

- Cash $0; this package never lists, pays, or authenticates.
- Official seller entry is `www.agensi.io/auth` and `/sell`. Do not treat `www.agensi.dev` Cloudflare Access (GitHub IdP) as seller entry; do not complete Access login from this worker.
- Stripe Connect / Zoneless USDC-on-Solana **account eligibility** remains unverified until Root completes an `agensi.io` creator session. Public ToS text is not an enabled-payout proof.
- Private account IDs, cookies, and payout wallets must not be added to this overlay.
- Upstream recipes stay public; this overlay is Apache-2.0 and does not relicense them.
- `provenance.mjs` only claims implemented local hash comparison. It does not imply Agensi review, catalog presence, git-apply success, Grexal paid execution, or buyer escrow acceptance.
