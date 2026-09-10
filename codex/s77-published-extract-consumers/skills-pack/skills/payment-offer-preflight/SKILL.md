---
name: payment-offer-preflight
description: Compare x402 and MPP payment challenges for one exact public HTTPS GET URL before buyer authorization. Use to normalize live payment terms, verify URL and realm binding, detect expiry or cross-protocol economic drift, and decide whether an offer is parseable or needs review. The target inspection uses no credential, signs nothing, sends no payment, follows no redirects, and reads no response body.
---

# Preflight a machine-payment offer

Call:

`GET https://agents.samedaydesk.com/commerce/payment-offer-preflight?url=<exact-https-get-url>`

Supply the complete public HTTPS URL, including every required query parameter.
Do not supply a URL containing credentials, authorization material, session
tokens, private-network hosts, or unresolved route parameters.

Read the current operation, response contract, and price from
`https://agents.samedaydesk.com/openapi.json`. Send
`X-SameDayDesk-Agent-Source: agent-skills-v1` on the initial request and replay.

On HTTP 402, verify the complete SameDayDesk resource, amount, Base network,
canonical Base USDC asset, and recipient. Pay only with caller authorization
through x402 v2 or MPP `evm/charge`. Preserve the source header and reconcile
the protocol receipt.

Use `decision`, normalized `offers`, `parity`, `findings`, URL and realm binding,
and expiry fields to decide whether the target offer can enter a separate buyer
authorization policy. Treat `parseable_offer` as evidence that the challenge
was well formed, not permission to pay the target. Route `review_required` to
policy review and treat `no_parseable_offer` as a failed preflight.

Verify the returned boundary states that the target inspection used no
credentials, signed and sent no target payment, read no response body, and
followed no redirect. Keep the result point-in-time. Re-run immediately before
any separately authorized target purchase because prices, recipients, expiry,
and network state can change.
