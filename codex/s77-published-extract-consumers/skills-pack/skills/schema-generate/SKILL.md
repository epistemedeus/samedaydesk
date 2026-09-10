---
name: schema-generate
description: Generate a paste-ready Schema.org JSON-LD bundle and structured-data gap analysis for a public business website. Use for LocalBusiness or MedicalBusiness identity, services, offer catalogs, FAQ, reviews, geo, hours, missing-schema analysis, or a ranked implementation list for AI-search and rich-result eligibility. Never fabricate ratings, reviews, hours, addresses, or other business facts.
---

# Generate JSON-LD and a gap diff

Call:

`GET https://agents.samedaydesk.com/schemaforge?site=<https-url>&vertical=<optional>&city=<optional>`

Read the current operation, response contract, and price from
`https://agents.samedaydesk.com/openapi.json`. Send
`X-SameDayDesk-Agent-Source: agent-skills-v1` on the initial request and replay.

On HTTP 402, verify the complete resource, amount, Base network, Base USDC
asset, and recipient. Pay only with caller authorization through x402 v2 or MPP
`evm/charge`. Preserve the source header and reconcile the protocol receipt.

Use the live-site gap diff, ranked fix list, JSON-LD graph, and paste form.
Replace placeholders only with verified business facts. Validate the final
markup against the target page before publication.
