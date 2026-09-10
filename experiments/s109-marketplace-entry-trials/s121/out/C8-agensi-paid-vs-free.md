# C8 — Agensi paid-delivery vs free provenance

Cash boundary **$0**. No accounts, Access login, listing, payment, or `get_skill confirm=true`. Local packager ≠ provider paid run.

## New fact

Local `provenance.mjs` comparing `s121/fixtures/agensi-free` vs `s121/fixtures/agensi-paid` reports:

| Field | Value |
|---|---|
| `packagingDeltaFiles` | `ACCEPTANCE.md`, `DELIVERY.md` (paid-only overlay) |
| identical | `SKILL.md` (same sha256 `7aa5e5674cc18c93d1c74a684da31fb5d3ef57b2ce95c292b82681eefe30788c`) |
| free-only | `README.md` |
| modified | 0 |
| `claimsProprietaryOwnershipOfFreeRecipes` | **false** |
| `listingPerformed` | false |
| `mcpPaidUnlockPerformed` | false |

Official Agensi seller entry is **https://www.agensi.io/auth** and **https://www.agensi.io/sell**. Buyer MCP is **https://mcp.agensi.io/mcp**. **https://www.agensi.dev** Cloudflare Access is an unrelated tenant, not a seller path. This cell did not enter that Access tenant.

## Listing description (implemented packaging/provenance only)

Implemented local packaging/provenance only: `node surfaces/agensi/package/bin/provenance.mjs` hashes a free recipe tree against a paid packaging directory and reports `packagingDeltaFiles` (paid-only + modified). On the S121 fixtures that delta is `ACCEPTANCE.md` and `DELIVERY.md`; `SKILL.md` is byte-identical to the free recipe and is not claimed as proprietary. `claimsProprietaryOwnershipOfFreeRecipes` is false by construction. This overlay does not list on Agensi, does not unlock paid MCP skills, and does not assert catalog presence, review pass, payout eligibility, git-apply success, Grexal paid execution, or buyer escrow acceptance. Local packager ≠ provider paid run.

## Anonymous HTTP (optional, already-known surfaces)

- `GET https://www.agensi.io/sell` → HTTP/2 **200**, title `How to Make Money With AI: Sell Agent Skills | Agensi`. Marketing HTML is not an enabled-payout proof.
- `POST https://mcp.agensi.io/mcp` `initialize` → HTTP/2 **200**, `serverInfo.name=agensi` `version=1.1.0`, `protocolVersion=2025-03-26`. **Did not** call `tools/call`, `search_skills`, or `get_skill` (including `confirm=true`).

## Guidance correction

Living S109 files no longer treat `www.agensi.dev` Access as seller entry. Official seller IdP on `.io` is email/password, email code, or Google — not GitHub. Access remains recorded only as `primaryTaskHost.role=unrelated-do-not-enter`.

Corrected (among others): `access-handoff.json`, `offer-descriptor.json`, package `README.md`, listing checklist, schema, `PINS.md`, experiment `README.md` / `RESULT.md`, buyer worksheet.

Historical `native-cells/out/A1–A3` records were left unchanged.

## Commands

```bash
node experiments/s109-marketplace-entry-trials/surfaces/agensi/package/bin/provenance.mjs \
  --freeDir experiments/s109-marketplace-entry-trials/s121/fixtures/agensi-free \
  --paidDir experiments/s109-marketplace-entry-trials/s121/fixtures/agensi-paid \
  --skillRecipePin epistemedeus/x402-data-gateway-skills@82d0f019713c7223898806144da08fdbeed5c666
# exit 0; packagingDeltaFiles ACCEPTANCE.md DELIVERY.md; claimsProprietaryOwnershipOfFreeRecipes=false

node experiments/s109-marketplace-entry-trials/surfaces/agensi/package/bin/validate-descriptor.mjs
# ok=true, networkCalls=0, publicListingSupported=false

npm --prefix experiments/s109-marketplace-entry-trials/surfaces/agensi/package test
# 15 pass / 0 fail
```

## Flags (do not inflate)

- `gitApplyVerified`: **false**
- `grexalPaidExecution`: **false**
- `buyerEscrowAcceptance`: **false**
- `listingPerformed`: **false**
- `localPackagerIsNotProviderPaidRun`: **true**

## Next measurable event

Root auth on **www.agensi.io** plus payout-method enabled state captured privately; still $0 and no publish from this worker. Do not use **www.agensi.dev** Access as seller entry.
