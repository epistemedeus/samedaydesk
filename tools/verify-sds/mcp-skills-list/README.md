# mcp-skills-list — SDS MCP `skills/list`

Owned path: `tools/verify-sds/mcp-skills-list/**` (W0-X95).

Proves a skills-capable client can list the three SameDayDesk well-known
skills (`web-extract`, `page-change`, `explicit-record`) over MCP
`skills/list` (SEP-2640) with resource digests, via a **loopback fixture
server** (cold clone works offline; no `npm ci`). Live apex
`https://samedaydesk.com/mcp` is cited read-only (`cite-apex` / `--live`).
Apex today is unpaid `tools/list`; this pack does not POST `tools/call`,
does not pay, and does not publish to a registry.

Names and descriptions pin
`tools/presence/fixtures/for-agents-cold-read/skills-index.json`.

## Required skills

| name | uri |
| --- | --- |
| `web-extract` | `skill://web-extract/SKILL.md` |
| `page-change` | `skill://page-change/SKILL.md` |
| `explicit-record` | `skill://explicit-record/SKILL.md` |

Initialize stays SDS apex protocol `2024-11-05` (`samedaydesk-agent-tools`
`1.2.0`) and declares `io.modelcontextprotocol/skills`. A
`2026-07-28`-only handshake is not a transport migration and is a seeded
refuse.

## Commands

```bash
# Cold list (loopback fixture) — exit 0
node tools/verify-sds/mcp-skills-list/cli.mjs skills/list --json

# Seeded silent empty success — exit 1, error.code SILENT_EMPTY
node tools/verify-sds/mcp-skills-list/cli.mjs --seeded-failure silent-empty-success --json

# Other seeded refuses
node tools/verify-sds/mcp-skills-list/cli.mjs --seeded-failure missing-skill --json
node tools/verify-sds/mcp-skills-list/cli.mjs --seeded-failure digest-mismatch --json
node tools/verify-sds/mcp-skills-list/cli.mjs --seeded-failure tools-call --json
node tools/verify-sds/mcp-skills-list/cli.mjs --seeded-failure protocol-2026-07-28-only --json
node tools/verify-sds/mcp-skills-list/cli.mjs --seeded-failure payment-signature --json
node tools/verify-sds/mcp-skills-list/cli.mjs --seeded-failure stripe-path --json
node tools/verify-sds/mcp-skills-list/cli.mjs --seeded-failure method-not-found-as-success --json
node tools/verify-sds/mcp-skills-list/cli.mjs --seeded-failure wellknown-as-skills-list --json

# Cold harness (list ok + all seeds refuse) — exit 0
node tools/verify-sds/mcp-skills-list/run-harness.mjs

# Tests
node --test tools/verify-sds/mcp-skills-list/cli.test.mjs
```

## Boundary

- `boundary.paymentSent` always `false`
- `boundary.toolsCalled` always `false` (list-only)
- Never sends `PAYMENT-SIGNATURE`, `X-PAYMENT`, or `stripe-signature`
- `--origin` Stripe / `cs=` / `buy.stripe.com` URLs refuse with `STRIPE_PATH_REFUSE` (no live POST)
- JSON-RPC `-32601` is not a catalog (`method-not-found-as-success`)
- HTTP `/.well-known/skills/index.json` is not SEP-2640 `skills/list` (`wellknown-as-skills-list`)
- No Stripe/x402 spend, no price/SKU edits, no neo, no merge, no registry publish

## Layout

```
cli.mjs                 JSON CLI
run-harness.mjs         cold acceptance entry
cli.test.mjs            node:test
lib/catalog.mjs         three skills + seeds + protocol pin
lib/envelope.mjs        JSON envelope
lib/digest.mjs          sha256 of committed SKILL.md bytes
lib/skills.mjs          frontmatter + presence index pin
lib/accept.mjs          initialize + skills/list accept
lib/fixture-server.mjs  loopback /mcp (node:http)
lib/client.mjs          unpaid POST client + guards
lib/refuse.mjs          seeded refuses
fixtures/skills-index.json
fixtures/skills/*/SKILL.md
fixtures/seeded-failures.json
fixtures/seeded/*.json
```
