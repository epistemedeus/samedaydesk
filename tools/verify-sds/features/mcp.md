# mcp

Free Streamable HTTP MCP on the SameDayDesk Express host. Protocol
`2024-11-05`. Server info `samedaydesk-agent-tools` `1.2.0`. Five tools. Paid
Fix Pack is listed, not called. This is apex `/mcp` on this repo, not the
gateway MCP on `agents.samedaydesk.com`.

| field | value |
| --- | --- |
| goal | free `initialize` then `tools/list` on the shipped process |
| entrypoint | `server/routes/mcp.js` mounted at `/mcp` from `server/app.js` |
| command | POST JSON-RPC `initialize` then `tools/list`; never `tools/call` from this map |
| state | five tools listed before any call; `boundary.toolsCalled=false` |
| tests | `npm run test:mcp` (router-only today — not host proof) |
| prerequisite | Express listen (`npm ci`, `node server/index.js`) |

## Surfaces

| id | kind | repo / public |
| --- | --- | --- |
| `mcp.mount` | mount | `server/app.js` `app.use("/mcp", mcpRouter)` |
| `mcp.route` | route | `server/routes/mcp.js` |
| `mcp.inventory` | inventory | `server/lib/mcp-tool-inventory.js` |
| `mcp.protocol` | protocol | JSON-RPC `2024-11-05` |
| `mcp.initialize` | method | `initialize` → protocolVersion, capabilities.tools, serverInfo |
| `mcp.tools.list` | method | `tools/list` → five tools |
| `mcp.tools.check_ai_readiness` | tool | free AI-readiness check |
| `mcp.tools.generate_complete_fix_pack` | tool | paid Fix Pack; list only |
| `mcp.tools.plan_taskmarket_delegation` | tool | plan only; no wallet, no spend |
| `mcp.tools.browse_taskmarket_tasks` | tool | public TaskMarket read |
| `mcp.tools.track_taskmarket_task` | tool | public TaskMarket track |
| `mcp.registry-auth` | well-known | `GET /.well-known/mcp-registry-auth` |
| `mcp.get.help` | http-get | GET `/mcp` human help page |
| `mcp.no-tools-call-for-verify` | boundary | lab-verify does not POST `tools/call` |

## Sub-features

- `list` returns `check_ai_readiness`, `generate_complete_fix_pack`, `plan_taskmarket_delegation`, `browse_taskmarket_tasks`, `track_taskmarket_task`.
- GET `/mcp` is a human help page; POST is JSON-RPC. GET `/mcp?cs=` is the Stripe return that shows a license; do not drive it.
- `/.well-known/mcp-registry-auth` is domain-ownership proof for the MCP registry namespace.
- `/.well-known/agent-card.json` on apex 308s to `https://agents.samedaydesk.com/.well-known/agent-card.json` and is not this surface.
- Seeded map fixture omits this family. `check-map.mjs --seed missing-surface` must flag `mcp.tools.list` (and the rest of the family).

## How to get to it (user POV)

- Add `{ "mcpServers": { "samedaydesk": { "url": "https://samedaydesk.com/mcp" } } }` in a remote-MCP client.
- Or POST `initialize` then `tools/list` to a local `node server/index.js` origin.
- TaskMarket notes: `TASKMARKET-INTEGRATION.md`.

## Driving it from this map

Preconditions:

- Root `node_modules` (Express) for a live listen.
- Do not POST payment or Stripe `cs_`.
- Do not treat `client/src/pages/Mcp.tsx` (`/x402`) as this surface.

- **Map coverage.** `node tools/verify-sds/features/check-map.mjs --json`. Exit 0. `result.families` includes `mcp`. `result.documented` includes `mcp.tools.list`.
- **Seeded missing surface.** `node tools/verify-sds/features/check-map.mjs --seed missing-surface --json`. Exit 1. `error.code` `SEED_REJECT`. `error.productCode` `missing_surface`. `error.surface` `mcp.tools.list`.
- **Live list (optional host proof).** POST `/mcp` `initialize` then `tools/list` on `node server/index.js`. Do not `tools/call`.

## Gotchas

- `test:mcp` mounts `mcpRouter` only. Host proof is `server/index.js`.
- Gateway MCP (merchant repo, more tools) is **not** this surface.
- Apex `https://samedaydesk.com/mcp` from a challenged VM is `cdn_challenge`, not product 200.
- `/x402` React page is unpaid x402 discovery. `/mcp` is Express Streamable HTTP.
- Do not buy the $39 Fix Pack or pass a `cs_` license.
- TaskMarket tools plan/browse/track only. They do not create tasks or spend.
