# LQDIST1 — unpaid three-surface distribution audit

Task LQDIST1 (batch LQ01). One branch. No payment. No price, payTo, facilitator, network, authorization, or settlement change. No new product.

Canonical paid catalog is the public SameDayDesk machine gateway at `https://agents.samedaydesk.com`. This marketing repository does not host those handlers. This audit enumerates the catalog, replays three free buyer surfaces, and records one of `CLEAR`, `HOLD`, `ABORT`, `absent`, or `unverified` per surface per route.

## Identity

| Field | Value |
| --- | --- |
| Origin | `https://agents.samedaydesk.com` |
| OpenAPI | `GET /openapi.json` version `1.23.40` |
| Observed | 2026-09-03T10:52:00Z |
| Canonical products | 22 |
| Paid operations replayed | 25 (22 products; GET+POST on two paths; plus one Circle Gateway alternate) |

Per-route machine table: [`per-route-table.json`](per-route-table.json).

Exact commands: [`COMMANDS.md`](COMMANDS.md).

Bounded outputs: [`evidence/`](evidence/).

## Surfaces

1. **What Agents Buy `preflight-x402@0.2.0`** — installed in scratch (`/tmp/lqdist1-scratch`), not committed. Host-scoped CLEAR/HOLD/ABORT from `https://whatagentsbuy.com/mcp` and `/api/preflight.json`. Fail-open UNRATED if unreachable.
2. **Agent402 inclusion/health** — cloned `https://github.com/MikeyPetrillo/Agent402` and read `src/x402-index.js`. Live snapshot: `GET https://agent402.tools/api/index?seller=agents.samedaydesk.com`. A paid route is included when OpenAPI carries `x-payment-info` and is not a non-product path. Health is the fraction of successful crawls (`healthScore`). Routable iff the last crawl succeeded (`isRoutable`). Paywall liveness is a separate unpaid 402 probe. `priceConflict` is HOLD.
3. **AgentCash discovery** — `@agentcash/discovery@1.7.5` `discover` against public `/openapi.json`. `check` / empty-body probe is recorded where it diverges.

No `PAYMENT-SIGNATURE`, `X-PAYMENT`, wallet, or settlement credential was sent.

## Per-route table

| Route | op | USD | WAB | Agent402 | AgentCash | Note |
| --- | --- | --- | --- | --- | --- | --- |
| GET /extract | extractUrl | 0.005 | CLEAR | CLEAR | CLEAR | |
| GET /read | readUrlAsMarkdown | 0.005 | CLEAR | **HOLD** | CLEAR | Bazaar 0.05 vs live/OpenAPI 0.005 |
| GET /scan | scanRepositoryRisk | 0.2 | CLEAR | CLEAR | CLEAR | |
| GET /schemaforge | generateStructuredData | 0.25 | CLEAR | CLEAR | CLEAR | |
| GET /enrich | enrichCompany | 0.05 | CLEAR | CLEAR | CLEAR | |
| GET /wallet-enrich | enrichWallet | 0.05 | CLEAR | CLEAR | CLEAR | |
| GET /deep-audit | auditAiSearchReadiness | 0.25 | CLEAR | CLEAR | CLEAR | |
| GET /defi/morpho-position | inspectMorphoPosition | 0.02 | CLEAR | CLEAR | CLEAR | |
| GET /defi/morpho-protection | planMorphoProtection | 0.1 | CLEAR | CLEAR | CLEAR | |
| GET /defi/morpho-market-underwrite | underwriteMorphoMarket | 0.25 | CLEAR | CLEAR | CLEAR | |
| GET /defi/morpho-preliquidation-replay | replayMorphoPreLiquidation | 0.1 | CLEAR | CLEAR | CLEAR | |
| GET /work/opportunity-preflight | preflightAgentOpportunity | 0.05 | CLEAR | CLEAR | CLEAR | |
| POST /work/opportunity-preflight | preflightAgentOpportunityForWorkflow | 0.05 | CLEAR | CLEAR | CLEAR | `{}` reaches 402 |
| GET /distribution/agent-discoverability-audit | auditAgentDiscoverability | 0.05 | CLEAR | CLEAR | CLEAR | example intent required for 402 |
| GET /commerce/payment-offer-preflight | preflightPaymentOffer | 0.005 | CLEAR | CLEAR | CLEAR | |
| POST /commerce/payment-offer-preflight | preflightPaymentOfferForWorkflow | 0.005 | CLEAR | CLEAR | CLEAR | |
| GET /commerce/settlement-proof | verifyBaseUsdcSettlement | 0.005 | CLEAR | CLEAR | CLEAR | |
| GET /chain/transaction-receipt | getTransactionReceipt | 0.002 | CLEAR | CLEAR | CLEAR | |
| GET /chain/solana-transaction-receipt | getSolanaTransactionReceipt | 0.002 | CLEAR | CLEAR | CLEAR | |
| POST /security/wallet-policy-conformance | evaluateWalletPolicyConformance | 0.01 | CLEAR | CLEAR | **HOLD** | empty probe 400; schema-valid 402 |
| POST /security/stateful-wallet-policy-conformance | evaluateStatefulWalletPolicyConformance | 0.01 | CLEAR | CLEAR | **HOLD** | empty probe 400; schema-valid 402 |
| GET /commerce/seller-integrity-audit | auditSellerIntegrity | 0.01 | CLEAR | CLEAR | CLEAR | |
| GET /commerce/contract-qualified-search | searchContractQualifiedServices | 0.01 | CLEAR | CLEAR | CLEAR | example query required for 402 |
| GET /distribution/agent-surface-budget-audit | auditAgentSurfaceBudget | 0.01 | CLEAR | CLEAR | CLEAR | |
| GET /gateway/commerce/payment-offer-preflight | preflightPaymentOfferWithCircleGateway | 0.005 | CLEAR | CLEAR | CLEAR | x402-only alternate, not a 23rd product |

What Agents Buy host row: `agents.samedaydesk.com` light `green`, verdict CLEAR, confidence `verified`, score 100, one delivered receipt 2026-08-30. The package is host-scoped, so every route inherited that host verdict.

Agent402 seller snapshot: health `1`, routable `true`, originResponded `true`, discoveryPath `/.well-known/x402`, paywall `{ok:true,status:402,url:.../extract,mpp:true}`, `paidToolCount` 25 of 32 listed tools. Router dispatch is `settlement_required` (below Agent402's settlement floor). That is a router spend gate, not a crawl-health failure.

AgentCash `discover` returned `found:true`, `trustTier:origin_hosted`, 25 paid endpoints, `openapiWarnings: []`, `l2Warnings: []`.

## Catalog projection in this repo

`client/src/pages/Mcp.tsx` lists the same 22 MCP tool names and numeric prices as the live OpenAPI paid products. No marketing-price or operation-id drift was reproduced here. GET+POST workflow variants share one MCP tool name, matching the 22-product claim. The Circle Gateway path is documented as an alternate, not a twenty-third dual-rail product.

No handler, OpenAPI document, or Bazaar row lives in this repository, so the two HOLDs were **not** patched here.

## Deviations (reproduced, not patched here)

1. **GET /read Agent402 HOLD.** Live unpaid 402 and OpenAPI price `0.005` (atomic `5000`). Agent402 reports `priceConflict` with Bazaar `0.05`. Changing the live price is forbidden. Bazaar rematerialization is GB06 PR 19; this branch did not touch it.
2. **Wallet POST AgentCash HOLD.** `POST /security/wallet-policy-conformance` and `POST /security/stateful-wallet-policy-conformance` validate `observations` before the unpaid 402 when the body is `{}`. AgentCash `check()` therefore reported `authMode: unprotected`. A schema-valid body returns 402 with amount `10000`. That is live-gateway request-order behavior, not a file in this repo. AgentCash's own docs name this failure `Expected 402, got 400`.

## Unresolved / next

- Publish request-body examples on the two wallet POST operations on the live gateway, or let empty AgentCash probes reach 402 before body validation. Do not change price or payTo.
- Rematerialize the Bazaar `/read` row to `0.005` on the GB06 tracker lane if that listing is still stale.
- Agent402 will not router-dispatch SameDayDesk until on-chain settlement exceeds its floor. That is their gate, not a SameDayDesk contract defect.

## Source changes

This PR adds the audit table, replay commands, bounded evidence, and an offline test that the 22-product projection and per-route three-surface results stay complete. No product, price, payTo, facilitator, network, authorization, or settlement behavior was changed.
