# apex-mcp

Free Streamable HTTP MCP on the SameDayDesk Express host. Protocol `2024-11-05`. Five tools. Paid Fix Pack is listed, not called.

| field | value |
| --- | --- |
| goal | free tools/list on the shipped process |
| entrypoint | `server/routes/mcp.js` mounted at `/mcp` from `server/index.js` |
| command | `mcp tools/list` |
| state | `samedaydesk-agent-tools` `1.2.0`; tools listed before any call |
| tests | `npm run test:mcp` (router-only today — not host proof) |
| prerequisite | Express listen (`npm ci`, `node server/index.js`) |

## Sub-features

- `list` returns `check_ai_readiness`, `generate_complete_fix_pack`, `plan_taskmarket_delegation`, `browse_taskmarket_tasks`, `track_taskmarket_task`.
- `no-call` refuses `mcp tools/call` (usage).
- `cite-pilot` points at Pilot `tools/ops/verify-samedaydesk-mcp.mjs` for live `https://agents.samedaydesk.com/mcp`.
- `missing-tool` seeded fail injects `does_not_exist_required_tool`.

## How to get to it (user POV)

- Add `{ "mcpServers": { "samedaydesk": { "url": "https://samedaydesk.com/mcp" } } }` in a remote-MCP client.
- GET `/mcp` is a human help page; POST is JSON-RPC.

## Driving it with verify-cli

Preconditions:

- Root `node_modules` (Express).
- Do not POST payment or Stripe `cs_`.

- **List.** `node tools/verify/cli.mjs mcp tools/list --json`. Spawns `server/index.js` if needed. Exit 0. `result.tools` is the five names. `boundary.toolsCalled` false. `listedBeforeCall` true.
- **Refuse call.** `node tools/verify/cli.mjs mcp tools/call --json`. Exit 2.
- **Cite live gateway.** `node tools/verify/cli.mjs mcp cite-pilot --json`. Exit 0. Does not POST `tools/call`.
- **Seeded missing tool.** `node tools/verify/cli.mjs --seeded-failure missing-required-mcp-tool --json`. Exit 1.

## Gotchas

- `test:mcp` mounts `mcpRouter` only. Host proof is `server/index.js`.
- Gateway MCP (24 tools, merchant repo) is **not** this surface.
- Apex `https://samedaydesk.com/mcp` GET may return product help text (HTTP 200, `server: hcdn`). That is not `tools/list`. Host proof is shipped `server/index.js` POST initialize then `tools/list`.
- HTTP 403 with `server: hcdn` or challenge HTML is `cdn_challenge`, never a product 200.
- Do not buy the $39 Fix Pack or pass a `cs_` license.
