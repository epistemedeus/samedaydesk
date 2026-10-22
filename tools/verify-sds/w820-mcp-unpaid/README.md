# w820-mcp-unpaid — SDS unpaid MCP list/call fixtures

Owned path: `tools/verify-sds/w820-mcp-unpaid/**` (W0-X199).

Proves unpaid Streamable-HTTP MCP `tools/list` against the SDS apex five tools
via a **loopback fixture server** (cold clone works offline; no `npm ci`),
bound to the committed `server/routes/mcp.js` tools-block SHA-256.

Live apex `https://samedaydesk.com/mcp` is cited read-only (`cite-apex` / `--live`).
`--live` never POSTs to production.

Disjoint from X70 `tools/verify-sds/mcp-unpaid/**` (list/refuse) and X135
`tools/verify-sds/mcp-tools-call-unpaid-w7/**` (unpaid `tools/call` isError).

## Apex five tools

- `check_ai_readiness` (free)
- `generate_complete_fix_pack` (**PAID** — listed, never called)
- `plan_taskmarket_delegation` (free)
- `browse_taskmarket_tasks` (free)
- `track_taskmarket_task` (free)

Cite: `server/lib/mcp-tool-inventory.js`, `server/routes/mcp.js`,
`server/scripts/test-mcp-protocol-negotiation.js` (`FROZEN_TOOLS_BLOCK_SHA256`).

Pinned tools-block sha: `068cbfdb8ddab4dac7eef335d51fbe347728d6ccca65bef0365a3eb831db6caf`.

## Commands

```bash
# Unpaid list (loopback fixture + source pin) — exit 0
node tools/verify-sds/w820-mcp-unpaid/cli.mjs tools/list --json

# Documented tools/call refuse — exit ≠ 0, toolsCalled=false
node tools/verify-sds/w820-mcp-unpaid/cli.mjs tools/call generate_complete_fix_pack --json

# Seeded paid / pin refuses — exit 1, clear error.code
node tools/verify-sds/w820-mcp-unpaid/cli.mjs --seeded-failure paid-tool-call --json
node tools/verify-sds/w820-mcp-unpaid/cli.mjs --seeded-failure payment-signature --json
node tools/verify-sds/w820-mcp-unpaid/cli.mjs --seeded-failure stripe-path --json
node tools/verify-sds/w820-mcp-unpaid/cli.mjs --seeded-failure tools-sha-mismatch --json
node tools/verify-sds/w820-mcp-unpaid/cli.mjs --seeded-failure paid-as-unpaid --json

# Cold harness (list ok + all seeds refuse) — exit 0
node tools/verify-sds/w820-mcp-unpaid/run-harness.mjs

# Tests
node --test tools/verify-sds/w820-mcp-unpaid/cli.test.mjs
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
lib/source-pin.mjs      committed mcp.js tools-block sha
lib/envelope.mjs        JSON envelope
lib/fixture-server.mjs  loopback /mcp (node:http)
lib/client.mjs          unpaid POST client + guards
lib/refuse.mjs          seeded paid / signature / stripe / sha refuses
fixtures/apex-tools.json
fixtures/source-pin.json
fixtures/seeded-failures.json
fixtures/seeded/*.json
```
