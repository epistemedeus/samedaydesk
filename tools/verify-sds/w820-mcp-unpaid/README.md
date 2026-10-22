# w820-mcp-unpaid — SDS unpaid MCP list/call fixtures

Owned path: `tools/verify-sds/w820-mcp-unpaid/**` (BOTWAVE-sds2-X199).

Proves unpaid Streamable-HTTP MCP **`tools/list`** plus a **safe unpaid
`tools/call` → `isError: true`** against the SDS apex five tools via a
**loopback fixture server** (cold clone works offline; no `npm ci`), bound to
the committed `server/routes/mcp.js` tools-block SHA-256.

Live apex `https://samedaydesk.com/mcp` is cited read-only (`cite-apex`).
`--live` and non-loopback `--origin` never POST.

Write boundary is this path only. Does not edit `tools/verify/**`, merchant
payment code, prices, or SKUs.

## Apex five tools

- `check_ai_readiness` (free — unpaid isError demo default: missing url)
- `generate_complete_fix_pack` (**PAID** — listed, never POSTed)
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

# Safe unpaid tools/call → isError (loopback fixture) — exit 0
node tools/verify-sds/w820-mcp-unpaid/cli.mjs tools/call --json
node tools/verify-sds/w820-mcp-unpaid/cli.mjs tools/call check_ai_readiness --json

# Paid tool refuse (never POST) — exit ≠ 0, PAID_REFUSE
node tools/verify-sds/w820-mcp-unpaid/cli.mjs tools/call generate_complete_fix_pack --json

# Seeded paid / signature / stripe / pin refuses — exit 1, clear error.code
node tools/verify-sds/w820-mcp-unpaid/cli.mjs --seeded-failure paid-tool-call --json
node tools/verify-sds/w820-mcp-unpaid/cli.mjs --seeded-failure payment-signature --json
node tools/verify-sds/w820-mcp-unpaid/cli.mjs --seeded-failure stripe-path --json
node tools/verify-sds/w820-mcp-unpaid/cli.mjs --seeded-failure tools-sha-mismatch --json
node tools/verify-sds/w820-mcp-unpaid/cli.mjs --seeded-failure paid-as-unpaid --json

# Cold harness (list + isError call ok + all seeds refuse) — exit 0
node tools/verify-sds/w820-mcp-unpaid/run-harness.mjs

# Tests
node --test tools/verify-sds/w820-mcp-unpaid/cli.test.mjs
```

## Boundary

- `boundary.paymentSent` always `false`
- `boundary.paidToolsCallPosted` always `false`
- Never sends `PAYMENT-SIGNATURE`, `X-PAYMENT`, or `stripe-signature`
- Never POSTs `tools/call` for `generate_complete_fix_pack`
- `--origin` must be `http` loopback (`127.0.0.1` / `localhost` / `::1`)
- Stripe / `cs=` / `buy.stripe.com` URLs refuse with `STRIPE_PATH_REFUSE` (no live POST)
- `--live` is `LIVE_REFUSE` (exit 1)
- No Stripe/x402 spend, no price/SKU edits, no merge

## Layout

```
cli.mjs                 JSON CLI
run-harness.mjs         cold acceptance entry
cli.test.mjs            node:test
lib/catalog.mjs         five tools + seeds + forbidden headers
lib/source-pin.mjs      committed mcp.js tools-block sha
lib/envelope.mjs        JSON envelope
lib/origin.mjs          loopback-only origin + body cap
lib/fixture-server.mjs  loopback /mcp (node:http) → list + unpaid isError
lib/client.mjs          unpaid POST client + isError shape assert
lib/refuse.mjs          seeded paid / signature / stripe / sha refuses
fixtures/apex-tools.json
fixtures/source-pin.json
fixtures/seeded-failures.json
fixtures/seeded/*.json
```
