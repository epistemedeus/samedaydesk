# mcp-unpaid — SDS unpaid MCP list/call fixtures

Owned path: `tools/verify-sds/mcp-unpaid/**` (W0-X70).

Proves unpaid Streamable-HTTP MCP `tools/list` against the SDS apex five tools
via a **loopback fixture server** (cold clone works offline; no `npm ci`).
Live apex `https://samedaydesk.com/mcp` is cited read-only (`cite-apex` / `--live`).

## Apex five tools

- `check_ai_readiness` (free)
- `generate_complete_fix_pack` (**PAID** — listed, never called)
- `plan_taskmarket_delegation` (free)
- `browse_taskmarket_tasks` (free)
- `track_taskmarket_task` (free)

Cite: `server/lib/mcp-tool-inventory.js`, `server/routes/mcp.js`.
Patterns (read-only): W0-B2 PR148 `heavy/w0-b2-verify-sds` `tools/verify/lib/mcp.mjs`
— this package does **not** write under `tools/verify/**`.

## Commands

```bash
# Unpaid list (loopback fixture) — exit 0
node tools/verify-sds/mcp-unpaid/cli.mjs tools/list --json

# Documented tools/call refuse — exit ≠ 0, toolsCalled=false
node tools/verify-sds/mcp-unpaid/cli.mjs tools/call generate_complete_fix_pack --json

# Seeded paid refuses — exit 1, clear error.code
node tools/verify-sds/mcp-unpaid/cli.mjs --seeded-failure paid-tool-call --json
node tools/verify-sds/mcp-unpaid/cli.mjs --seeded-failure payment-signature --json
node tools/verify-sds/mcp-unpaid/cli.mjs --seeded-failure stripe-path --json

# Cold harness (list ok + all seeds refuse) — exit 0
node tools/verify-sds/mcp-unpaid/run-harness.mjs

# Tests
node --test tools/verify-sds/mcp-unpaid/cli.test.mjs
```

## Boundary

- `boundary.paymentSent` always `false`
- `boundary.toolsCalled` always `false` (list-only)
- Never sends `PAYMENT-SIGNATURE`, `X-PAYMENT`, or `stripe-signature`
- `--origin` Stripe / `cs=` / `buy.stripe.com` URLs refuse with `STRIPE_PATH_REFUSE` (no live POST)
- No Stripe/x402 spend, no price/SKU edits, no merge

## Layout

```
cli.mjs                 JSON CLI
run-harness.mjs         cold acceptance entry
cli.test.mjs            node:test
lib/catalog.mjs         five tools + seeds + forbidden headers
lib/envelope.mjs        JSON envelope (W0-B2-shaped)
lib/fixture-server.mjs  loopback /mcp (node:http)
lib/client.mjs          unpaid POST client + guards
lib/refuse.mjs          seeded paid / signature / stripe refuses
fixtures/apex-tools.json
fixtures/seeded-failures.json
fixtures/seeded/*.json
```
