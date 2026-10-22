# w1000-mcp-unpaid — SDS unpaid MCP list/call fixtures

Owned path: `tools/verify-sds/w1000-mcp-unpaid/**` (W0-X254 / wave w1000).

Proves unpaid Streamable-HTTP MCP `tools/list` for the SDS apex five tools
via a **loopback fixture server** (cold clone works offline; no `npm ci`),
bound to the committed `server/routes/mcp.js` tools-block SHA-256.

Live apex `https://samedaydesk.com/mcp` is cited read-only (`cite-apex`).
`--live` and non-loopback `--origin` never POST.

Disjoint from X70 `tools/verify-sds/mcp-unpaid/**`, X135
`tools/verify-sds/mcp-tools-call-unpaid-w7/**`, X239
`tools/verify-sds/w920-mcp-unpaid/**`, X274
`tools/verify-sds/w1020-mcp-unpaid/**`, and X294
`tools/verify-sds/w1040-mcp-unpaid/**`. This pack does **not** write
those paths, `tools/verify/**`, Neomorphic surfaces, or any payment/publish
surface.

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
# Unpaid list (loopback fixture) — exit 0
node tools/verify-sds/w1000-mcp-unpaid/cli.mjs tools/list --json

# Documented tools/call refuse — exit ≠ 0, toolsCalled=false
node tools/verify-sds/w1000-mcp-unpaid/cli.mjs tools/call generate_complete_fix_pack --json

# Seeded paid refuses — exit 1, clear error.code
node tools/verify-sds/w1000-mcp-unpaid/cli.mjs --seeded-failure paid-tool-call --json
node tools/verify-sds/w1000-mcp-unpaid/cli.mjs --seeded-failure payment-signature --json
node tools/verify-sds/w1000-mcp-unpaid/cli.mjs --seeded-failure stripe-path --json
node tools/verify-sds/w1000-mcp-unpaid/cli.mjs --seeded-failure cs-query --json
node tools/verify-sds/w1000-mcp-unpaid/cli.mjs --seeded-failure tools-sha-mismatch --json

# Cold harness (list ok + all seeds refuse) — exit 0
node tools/verify-sds/w1000-mcp-unpaid/run-harness.mjs

# Tests
node --test tools/verify-sds/w1000-mcp-unpaid/cli.test.mjs
```

## Boundary

- `boundary.paymentSent` always `false`
- `boundary.toolsCalled` always `false` (list-only)
- Never sends `PAYMENT-SIGNATURE`, `X-PAYMENT`, or `stripe-signature`
- `--origin` must be `http` loopback (`127.0.0.1` / `localhost` / `::1`)
- Stripe / `cs=` / `buy.stripe.com` URLs refuse with `STRIPE_PATH_REFUSE` (no live POST)
- `--live` is `LIVE_REFUSE` (exit 1)
- No Stripe/x402 spend, no price/SKU edits, no merge, no publish, no neo

## Layout

```
cli.mjs                 JSON CLI
run-harness.mjs         cold acceptance entry
cli.test.mjs            node:test
PIN.json                wave pin
SOURCE.txt              shipped + prior cites
lib/catalog.mjs         five tools + seeds + forbidden headers
lib/source-pin.mjs      committed mcp.js tools-block sha
lib/envelope.mjs        JSON envelope
lib/origin.mjs          loopback-only origin + body cap
lib/fixture-server.mjs  loopback /mcp (node:http)
lib/client.mjs          unpaid POST client + guards
lib/refuse.mjs          seeded paid / signature / stripe / sha refuses
fixtures/apex-tools.json
fixtures/window.json
fixtures/source-pin.json
fixtures/seeded-failures.json
fixtures/seeded/*.json
```
