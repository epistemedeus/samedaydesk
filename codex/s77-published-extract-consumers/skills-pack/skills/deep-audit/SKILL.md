---
name: deep-audit
description: Run a combined AI-search-readiness audit for a public company domain. Use when one report should join firmographics, technology, contact and DNS evidence, an AI-readiness score, structured-data gaps, a paste-ready JSON-LD fix list, and a combined grade. Do not present the grade as a search-ranking guarantee or invent missing business facts.
---

# Run a combined AI-search audit

Call:

`GET https://agents.samedaydesk.com/deep-audit?domain=<domain-or-url>`

Read the current operation, response contract, and price from
`https://agents.samedaydesk.com/openapi.json`. Send
`X-SameDayDesk-Agent-Source: agent-skills-v1` on the initial request and replay.

On HTTP 402, verify the complete resource, amount, Base network, Base USDC
asset, and recipient. Pay only with caller authorization through x402 v2 or MPP
`evm/charge`. Preserve the source header and reconcile the protocol receipt.

Keep firmographic, infrastructure, AI-readiness, structured-data, and fix-list
evidence separate even when reporting the combined grade. A point-in-time audit
does not prove future citation, traffic, leads, or revenue.
