---
name: agent-discoverability-audit
description: Measure whether a public x402 or MPP machine service is found for a brand-blind buyer intent and whether public catalogs carry the caller-expected exact route price. Use for machine-service rank audits, catalog coverage checks, stale-price diagnosis, expected-route verification, competitor discovery, or deciding which service metadata to refine. Do not use this as proof of runtime terms, demand, conversion, reliability, or future rank.
---

# Audit agent discoverability

Call SameDayDesk's paid, machine-readable catalog audit.

## Build the request

Use:

`GET https://agents.samedaydesk.com/distribution/agent-discoverability-audit?origin=<https-origin>&intent=<brand-blind-capability>&route=<optional-path>&payTo=<optional-address>&expectedPriceUsd=<optional-exact-price>`

- Supply an HTTPS origin without a path or query.
- Describe the capability in 20 to 500 characters without the target hostname
  or brand.
- Add the exact expected path when route-level presence matters.
- Add `payTo` only when aliases share one EVM recipient.
- Add `expectedPriceUsd` only with an exact route. It accepts at most six
  fractional digits and compares public catalog metadata with the caller's
  expectation. It does not verify live unsigned payment terms.

Read the current operation and price from
`https://agents.samedaydesk.com/openapi.json` before paying. Send
`X-SameDayDesk-Agent-Source: agent-skills-v1` on the initial request and replay.

On HTTP 402, verify the complete resource, amount, Base network, Base USDC
asset, and recipient. Pay only with caller authorization, through x402 v2 or
MPP `evm/charge`. Preserve the source header and reconcile the protocol receipt.

Use `summary`, source-native ranks, expected-route presence, per-source
`priceObservation`, `findings`, and `nextActions`. Keep source outages and
unknown prices visible. Before acting on price drift, preflight the seller's
live unsigned x402 and MPP offers. A materialization settlement is a separate
authorization and should run at most once for a distinct fact, followed by
event-driven readback. Report the audit as point-in-time discovery and
catalog-coherence evidence, never as runtime truth, buyer demand, or revenue.
