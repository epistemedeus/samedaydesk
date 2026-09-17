# mcp-tools-call-unpaid-w7 — SDS unpaid tools/call → isError fixtures

Owned path: `tools/verify-sds/mcp-tools-call-unpaid-w7/**` (W0-X135).

Proves unpaid Streamable-HTTP MCP **`tools/call`** against a **loopback fixture
server** returns an MCP `CallToolResult` with **`isError: true`** (cold clone
works offline; no `npm ci`). Disjoint from X70 `tools/verify-sds/mcp-unpaid/**`
(list/refuse). Live apex `https://samedaydesk.com/mcp` is cited read-only.

## Behavior

1. **Happy (exit 0):** POST `tools/call` for a free apex tool (default
   `check_ai_readiness`) against the fixture → assert
   `result.isError === true` and `content[{type:"text", text}]` shape.
   `boundary.paymentSent=false`; never sends `PAYMENT-SIGNATURE`.
2. **Seeded refuses (exit ≠ 0):** paid Fix Pack call, `PAYMENT-SIGNATURE`,
   Stripe checkout path — clear JSON `error.code`, no payment, no paid POST.

## Apex five tools

- `check_ai_readiness` (free — unpaid isError demo default)
- `generate_complete_fix_pack` (**PAID** — never POSTed; seeded `PAID_REFUSE`)
- `plan_taskmarket_delegation` (free)
- `browse_taskmarket_tasks` (free)
- `track_taskmarket_task` (free)

Cite: `server/lib/mcp-tool-inventory.js`, `server/routes/mcp.js`.
Patterns (read-only): W0-X70 PR162 `mcp-unpaid`, W0-B2 PR148
`tools/verify/lib/mcp.mjs` — this package does **not** write under
`tools/verify/**` or `tools/verify-sds/mcp-unpaid/**`.

## Commands

```bash
# Unpaid tools/call → isError (loopback fixture) — exit 0
node tools/verify-sds/mcp-tools-call-unpaid-w7/cli.mjs tools/call --json
node tools/verify-sds/mcp-tools-call-unpaid-w7/cli.mjs tools/call check_ai_readiness --json

# Paid tool refuse (never POST) — exit ≠ 0, PAID_REFUSE
node tools/verify-sds/mcp-tools-call-unpaid-w7/cli.mjs tools/call generate_complete_fix_pack --json

# Live origin / --live refuse (never POST) — exit 1, LIVE_REFUSE
node tools/verify-sds/mcp-tools-call-unpaid-w7/cli.mjs tools/call --live --json
node tools/verify-sds/mcp-tools-call-unpaid-w7/cli.mjs tools/call --origin https://samedaydesk.com --json

# Seeded paid refuses — exit 1, clear error.code
node tools/verify-sds/mcp-tools-call-unpaid-w7/cli.mjs --seeded-failure paid-tool-call --json
node tools/verify-sds/mcp-tools-call-unpaid-w7/cli.mjs --seeded-failure payment-signature --json
node tools/verify-sds/mcp-tools-call-unpaid-w7/cli.mjs --seeded-failure stripe-path --json

# Cold harness (unpaid isError ok + all seeds refuse) — exit 0
node tools/verify-sds/mcp-tools-call-unpaid-w7/run-harness.mjs

# Tests
node --test tools/verify-sds/mcp-tools-call-unpaid-w7/cli.test.mjs
```

## Boundary

- `boundary.paymentSent` always `false`
- `boundary.paidToolsCallPosted` always `false`
- Never sends `PAYMENT-SIGNATURE`, `X-PAYMENT`, or `stripe-signature`
- Never POSTs `tools/call` for `generate_complete_fix_pack`
- `--origin` must be `http` loopback (`127.0.0.1` / `localhost` / `::1`); live apex is `cite-apex` only
- `--live` is `LIVE_REFUSE` (exit 1)
- No Stripe/x402 spend, no price/SKU edits, no merge

## Layout

```
cli.mjs                 JSON CLI
run-harness.mjs         cold acceptance entry
cli.test.mjs            node:test
lib/catalog.mjs         five tools + seeds + forbidden headers
lib/envelope.mjs        JSON envelope (W0-B2-shaped)
lib/origin.mjs          loopback-only origin + body cap
lib/fixture-server.mjs  loopback /mcp (node:http) → unpaid isError
lib/client.mjs          unpaid POST client + isError shape assert
lib/refuse.mjs          seeded paid / signature / stripe refuses
fixtures/apex-tools.json
fixtures/seeded-failures.json
fixtures/seeded/*.json
```
