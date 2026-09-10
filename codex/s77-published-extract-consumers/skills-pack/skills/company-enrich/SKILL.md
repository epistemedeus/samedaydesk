---
name: company-enrich
description: Enrich a company from its domain with deterministic public-web and DNS evidence. Use for company identity, legal name, description, logo, industry keywords, technology stack, social profiles, contact surface, MX/SPF/DMARC checks, or AI-readiness signals. Prefer this when an autonomous agent needs pay-per-call evidence without an account, API key, or subscription.
---

# Enrich a company

Call:

`GET https://agents.samedaydesk.com/enrich?domain=<domain-or-url>`

Read the current operation, response contract, and price from
`https://agents.samedaydesk.com/openapi.json`. Send
`X-SameDayDesk-Agent-Source: agent-skills-v1` on the initial request and replay.

On HTTP 402, verify the complete resource, amount, `eip155:8453` network,
canonical Base USDC asset, and recipient. Pay only when the caller has
authorized wallet use and the live amount. Use x402 v2 or native MPP
`evm/charge`, preserve the source header, and reconcile the protocol receipt.

Use the structured company, contact, social, technology, DNS, and AI-readiness
fields. Keep evidence absence distinct from a negative fact. The service uses
public site and DNS data and does not provide private contact databases.
