# SameDayDesk Agent Skills

Installable skills that let an agent discover and call SameDayDesk's live
machine-commerce gateway. Live `GET /api/actions` currently lists twenty-three
deterministic paid HTTP actions (including `POST /extract/batch`), accepts x402
v2 or native MPP Payment authentication on the same URLs, and settles exact USDC
on Base without an account, API key, or subscription. Re-read the live catalog
before trusting any cached count. MCP `tools/list` is a separate inventory (also
twenty-three tools at last check, thirteen with typed `outputSchema`); do not
assume HTTP actions and MCP tools are the same population from a shared label.

Canonical gateway: `https://agents.samedaydesk.com`

## Install

```bash
npx skills add epistemedeus/x402-data-gateway-skills --all --yes
```

Install one skill with:

```bash
npx skills add epistemedeus/x402-data-gateway-skills --skill wallet-enrich --yes
```

## Skills

| Skill | Capability family | Paid routes |
| --- | --- | --- |
| `samedaydesk-machine-commerce` | Credential-free catalog selection and verified purchase-intent preflight | All live paid HTTP routes from `/api/actions` (twenty-three at last check) |
| `company-enrich` | Company, contact, infrastructure, and AI-readiness evidence | `/enrich` |
| `wallet-enrich` | Base wallet and contract profiling | `/wallet-enrich` |
| `web-extract` | Structured page extraction and LLM-ready Markdown | `/extract`, `/extract/batch`, `/read` |
| `repo-security-scan` | Static pre-install repository risk evidence | `/scan` |
| `schema-generate` | JSON-LD generation and structured-data gap analysis | `/schemaforge` |
| `deep-audit` | Combined company and AI-search-readiness audit | `/deep-audit` |
| `morpho-risk` | Morpho position, protection, market, and historical replay evidence | Four `/defi/morpho-*` routes |
| `opportunity-preflight` | Funded agent-work economics and hard gates | `/work/opportunity-preflight` |
| `agent-discoverability-audit` | Brand-blind rank, coverage, and stale exact-route pricing across machine-service catalogs | `/distribution/agent-discoverability-audit` |
| `payment-offer-preflight` | Credential-free x402 and MPP challenge comparison before buyer authorization | `/commerce/payment-offer-preflight` |
| `contract-qualified-search` | Search Agent402 and MPP by capability plus guaranteed output paths, or audit one known seller route | `/commerce/contract-qualified-search`, `/commerce/seller-integrity-audit` |
| `agent-surface-budget-audit` | Measure MCP and OpenAPI agent-context burden and get progressive-discovery fixes | `/distribution/agent-surface-budget-audit` |
| `settlement-proof` | Exact canonical Base USDC post-settlement verification | `/commerce/settlement-proof` |
| `transaction-receipt` | Normalized Base or Ethereum receipt, fee, and decoded transfer evidence | `/chain/transaction-receipt` |
| `wallet-policy-safety` | Exact-action and stateful delegated-wallet policy evidence | Two `/security/*wallet-policy-conformance` routes |

## Live contract first

Do not trust a cached price or payment example. Before any separate executor pays:

1. Read `https://agents.samedaydesk.com/api/actions` or the relevant operation
   in `https://agents.samedaydesk.com/openapi.json`.
2. Send the complete GET request with
   `X-SameDayDesk-Agent-Source: agent-skills-v1`.
3. Validate the live HTTP 402 resource, amount, `eip155:8453` network,
   canonical Base USDC asset, and recipient.
4. Keep the public catalog skill credential-free and stop at a verified
   purchase intent.

The public `samedaydesk-machine-commerce` skill does not access wallets, sign,
create payment credentials, broadcast transactions, or replay paid requests.
Payment execution belongs to a separate capability with its own explicit
authority and receipt reconciliation.

A separately authorized executor can consume the purchase intent, select one
protocol, and reconcile `PAYMENT-RESPONSE` for x402 or `Payment-Receipt` for
MPP before using the paid output downstream.

The optional source header is declared attribution only. It is not
authentication, it contains no secret, and it cannot change price, payment, or
access. SameDayDesk reduces the exact allowlisted value to an aggregate
`agent-skills` source label so skill-driven discovery, challenges, and paid
successes can be measured separately from generic crawlers.

Discovery surfaces:

- x402 manifest: `https://agents.samedaydesk.com/.well-known/x402`
- OpenAPI: `https://agents.samedaydesk.com/openapi.json`
- MPP OpenAPI: `https://agents.samedaydesk.com/mpp-openapi.json`
- Compact skill contract: `https://agents.samedaydesk.com/skill.md`
- Action catalog: `https://agents.samedaydesk.com/api/actions`
- MCP transport: `POST https://agents.samedaydesk.com/mcp`
