# A3 Agensi buyer/economics (2026-09-10)

Cash boundary **$0**. No Access login, signup, listing, purchase, or paid x402 replay.

## New fact

Independent buyer-replay of a SameDayDesk Agensi offer does **not** need Cloudflare Access, Stripe, or Solana USDC. The A2 sanitized listing descriptor is a complete offline artifact: `checklist.mjs` validates schema, pin `epistemedeus/x402-data-gateway-skills@82d0f019713c7223898806144da08fdbeed5c666`, 16 public recipes, `ownershipClaim.claimsProprietaryOwnershipOfFreeRecipes=false`, and an explicit paid vs free delta. npm test **13/13**; tampered pin and proprietary-ownership claims fail closed.

Anonymous sell-page payout verification is still blocked. Unauthenticated GET `https://www.agensi.dev/sell` is HTTP/2 **302** to `mlehman-899.cloudflareaccess.com` (kid `a6751de448d4c74b6816fae20aebc09a22562b1bb5c77eff4e3d5bf33dd98fec`). Followed login HTML title is **Sign in ・ Cloudflare Access**; only IdP is **GitHub**.

Public ToS on `www.agensi.io` (effective 2026-03-02, last updated 2026-09-02) names Stripe Connect **or** Zoneless USDC-on-Solana, **$5.00** min paid, **70/30** net ex-VAT, and §6.3 original-author-or-distribution-rights. That is contract text, not an enabled-account proof.

## Independent buyer-replay

A buyer who is not Root and holds no Agensi session can decide whether the offer is worth paying for from the listing descriptor plus public catalogs.

### Offline (complete now)

From repository root:

```bash
node experiments/s109-marketplace-entry-trials/surfaces/agensi/package/bin/checklist.mjs
node experiments/s109-marketplace-entry-trials/surfaces/agensi/package/bin/validate-descriptor.mjs
npm --prefix experiments/s109-marketplace-entry-trials/surfaces/agensi/package test
```

This cell: `ok=true`, `networkCalls=0`, `publicListingSupported=false`, `claimsProprietaryOwnershipOfFreeRecipes=false`, 13 checklist items, 8 Access-handoff steps, 16 recipes.

What the descriptor proves without Access:

| Check | Result |
| --- | --- |
| Local JSON Schema (no network `$ref`) | pass |
| Pin SHA `82d0f019713c7223898806144da08fdbeed5c666` | pass |
| 16 public skill directories | pass |
| Proprietary-ownership flag is false | pass |
| Paid deliverable vs free alternative vs competent delta | explicit |
| Min paid $5 / 70/30 marked `doNotAssumeEligible` | encoded |
| Tampered pin or proprietary claim | fail closed |

### Optional $0 network (does not unlock payout eligibility)

Exercised this cell, then stopped:

- GitHub pin tree: **16** skill dirs; **LICENSE 404**; `tests/recipes` present.
- `GET https://agents.samedaydesk.com/.well-known/x402` — x402 v2, **24** route templates.
- Unpaid `GET /extract?url=https://example.com` — HTTP **402**, amount **5000** atomic Base USDC (**$0.005**), network `eip155:8453`, asset `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, `payTo` `0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee`. No `PAYMENT-SIGNATURE`.
- MCP `search_skills` query `samedaydesk x402 data gateway` (no auth) — three unrelated **paid** hits (`x402-attack-surface-gate` 95 credits, `arweave-gateway-setup` 25, `agent-api-gateway` 25). **Zero** pin hits.

Stop: no Access, no Agensi account, no paid install, no paid gateway body.

## Buyer cannot verify yet

- Stripe Connect eligibility
- Zoneless USDC-on-Solana eligibility
- Authenticated `/sell` or `/dashboard/submit` payout widgets on either host
- Contents of a live Agensi zip (nothing listed; worker will not publish)
- Delivered JSON from a paid SameDayDesk HTTP action

## Competent free alternative

Clone or `npx skills add epistemedeus/x402-data-gateway-skills --all --yes` at pin `82d0f019713c7223898806144da08fdbeed5c666` and use the live gateway at `https://agents.samedaydesk.com`.

Public recipes stay credential-free discovery / preflight. They stop before wallet access or paid replay. DIY acceptance is: pin SHA + command hashes (no secrets) + pass/fail against the live unpaid 402 terms (amount, network, asset, `payTo`).

This cell did **not** run `npx skills add` into the workspace; the pin tree and unpaid 402 are the first-person proof.

## Paid delta

If Root later enables a payout method and lists, the Agensi buyer would pay for **supported packaging, acceptance, and ops**, not exclusive recipe IP and not a new gateway route:

- Versioned ZIP + `SKILL.md` that cites the pin
- Machine-checkable acceptance report (commit, command hashes, pass/fail)
- Storefront + optional MCP discovery after the 8-point scan and human review (public copy: usually 24–48h)
- Fingerprinted delivery and merchant-of-record tax
- Creator payout ops at 70/30 of net ex-VAT — eligibility still unverified

A buyer who only wants the recipes and unpaid 402 terms does not need Agensi.

## Attribution (do not resell free recipes as proprietary)

ToS §6.3 (last updated 2026-09-02):

> By listing a skill, you represent and warrant that you are the original author of the skill or have all necessary rights to distribute it, the skill does not infringe upon the intellectual property rights of any third party, … and the listing description accurately describes the skill's functionality.

Plan:

- Cite `epistemedeus/x402-data-gateway-skills@82d0f019713c7223898806144da08fdbeed5c666`.
- Cite merchant evidence `epistemedeus/x402-url-extractor@3516cd40ba275c9f228443158097137cac44d003` separately.
- The pinned recipe tree has **no LICENSE file**. This overlay does not relicense those files.
- Schema const + npm test keep `claimsProprietaryOwnershipOfFreeRecipes` false.
- Neo pin `274bec996ac744573cca428b0de7cd3ec1d146cb` stays omitted until Root identifies the repo.

Allowed listing copy (if Root later publishes): packaging + acceptance evidence + Agensi ops, with the pin SHA and a statement that the 16 directories remain upstream public recipes.

Forbidden: “proprietary SameDayDesk recipes”, exclusive original IP for those files, omitting the pin, implying an Agensi purchase is required to use the public gateway.

## Economics worksheet (not a live quote; nothing listed)

| Line | Buyer pays (ex VAT) | Platform | Creator | Note |
| --- | ---: | ---: | ---: | --- |
| Agensi min paid (ToS floor) | $5.00 (25 credits) | $1.50 | $3.50 | Paid publish blocked until a payout method is enabled |
| `/sell` $29 example | $29.00 | $8.70 | $20.30 | Public marketing example, not an SDS list price |
| Agensi free listing | $0 | $0 | $0 | Free skills do not cost credits; still needs a Root account |
| Unpaid x402 `/extract` challenge | $0 recorded | n/a | n/a | Quoted $0.005 USDC on Base **if** a buyer later pays the gateway |

Three cash layers must not be summed: public GitHub recipes ($0); optional SameDayDesk x402/MPP USDC on Base; optional Agensi skill purchase (USD/credits at 70/30). VAT collected by Agensi is never part of the 70/30 split.

## Next measurable event

Root Cloudflare Access and/or an `agensi.io` creator session, still $0: archive payout-method enabled state (Stripe connected true/false, Zoneless enabled true/false) and verbatim authenticated submit-flow fee copy **privately**. Success: HTTP 200 creator submit form after a Root session cookie, quoting enabled rails, **without a publish**.

Independent buyer-replay of the current descriptor does **not** wait on that event. This worker will not perform it.
