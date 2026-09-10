# A2-agensi-package

**New fact:** A provider-neutral Agensi listing package now lives at experiments/s109-marketplace-entry-trials/surfaces/agensi/package and validates offline. It encodes a 13-item listing checklist (ZIP+SKILL.md, $5 min paid price, 70/30 net ex-VAT, ToS §6.3 attribution, 8-point scan, no public seller API), Cloudflare Access GitHub handoff steps for Root on https://www.agensi.dev/sell (team mlehman-899.cloudflareaccess.com), and a sanitized offer descriptor that cites the 16 public skill directories at epistemedeus/x402-data-gateway-skills@82d0f019713c7223898806144da08fdbeed5c666 with ownershipClaim.claimsProprietaryOwnershipOfFreeRecipes=false (pinned tree has no LICENSE file). package.json script `validate` runs bin/validate-descriptor.mjs against a local JSON Schema; the engine refuses network $ref. npm test: 13/13 pass. This worker did not list or authenticate. Stripe Connect / Zoneless USDC account eligibility remains not-verifiable-without-auth.

**Runnable:** `/workspace/experiments/s109-marketplace-entry-trials/surfaces/agensi/package/bin/validate-descriptor.mjs`

**Auth still needed:** True

**Next:** Root auth (Cloudflare Access on .dev and/or agensi.io creator session) plus payout-method enabled state captured privately; still $0 and no publish from this worker.
