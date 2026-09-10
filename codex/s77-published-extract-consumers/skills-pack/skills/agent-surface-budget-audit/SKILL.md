---
name: agent-surface-budget-audit
description: Measure a public agent service's MCP tools/list and OpenAPI discovery burden before any tool call or target payment. Use when an agent platform, MCP server owner, API seller, or agent FinOps workflow needs bounded byte and comparative token estimates, the heaviest tool or operation definitions, missing selection contracts, progressive-discovery repairs, or a verified non-spending purchase intent for SameDayDesk's agent-surface budget audit.
---

# Audit an agent surface budget

Use SameDayDesk's canonical machine-commerce origin:

`https://agents.samedaydesk.com`

The paid route is:

`GET /distribution/agent-surface-budget-audit`

Read its current operation from
`https://agents.samedaydesk.com/openapi.json` before constructing a request.
Treat the exact unpaid HTTP 402 challenge as authoritative for price, request
binding, Base network, canonical USDC asset, and recipient.

## Construct the audit

Provide:

- `origin`: a credential-free public HTTPS origin with no path or query;
- `mcpPath`: optional exact root-relative MCP path, default `/mcp`;
- `openApiPath`: optional exact root-relative OpenAPI path, default
  `/openapi.json`;
- `mcpBudgetBytes`: optional preferred raw tools/list ceiling from 8,192 through
  1,000,000 bytes;
- `openApiBudgetBytes`: optional preferred OpenAPI ceiling from 32,768 through
  1,000,000 bytes.

Reject credentials, non-HTTPS origins, non-default ports, path-bearing origins,
route templates, query-bearing discovery paths, and local or non-public
targets.

Send `X-SameDayDesk-Agent-Source: agent-skills-v1` only on the initial unpaid
request when declared attribution is useful. It is not authentication and
cannot change price or access.

## Produce a verified purchase intent

On HTTP 402:

1. require the challenged resource URL to equal the complete request;
2. require Base `eip155:8453` and canonical Base USDC;
3. verify the current amount and recipient against caller policy;
4. select exactly one compatible x402 v2 or native MPP `evm/charge` offer;
5. freeze the origin, discovery paths, byte ceilings, method, exact URL,
   protocol, amount, network, asset, recipient, and expiry;
6. return `credentialsUsed: false`, `paymentSigned: false`, and
   `paymentSent: false`;
7. stop before wallet access or paid replay.

A separate payment executor with explicit authority may consume that intent.
Never return opaque offer state or raw payment headers.

## Validate separately paid output

After a separately authorized executor returns the response and receipt,
require:

- `product` equals `samedaydesk-agent-surface-budget-audit`;
- the returned request equals the frozen origin, paths, and byte ceilings;
- `decision` is `within_budget`, `optimize`, or `surface_incomplete`;
- MCP and OpenAPI availability, bytes, budgets, counts, and heaviest definitions
  are present only for surfaces actually acquired;
- the byte-derived token estimate is interpreted only as
  `ceil(UTF-8 bytes / 4)`, not tokenizer billing;
- no target schema, response body, cursor, or session identifier is returned;
- the boundary reports no credential, target tool call, redirect, target
  payment, or schema retention.

Interpret `within_budget` as passing the caller-selected raw byte ceilings, not
as proof of task success or optimal tool selection. Interpret `optimize` as a
bounded repair opportunity. Interpret `surface_incomplete` as a missing,
invalid, oversized, or unreachable discovery surface, not a zero-byte result.

Use the repair actions as seller and platform evidence. Keep titles,
disambiguating descriptions, request and response contracts, and safety
boundaries in machine discovery. Move long examples and narrative guidance to
linked resources, or publish task-scoped and progressive discovery views. Do
not remove selection-critical semantics merely to shrink a byte count.
