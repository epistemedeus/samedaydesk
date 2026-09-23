# samedaydesk verification map

This directory is the maintained source for verifying useful-jobs cold acquire, the Express host, apex `/mcp` five tools, and unpaid x402 pages against the **shipped** artifact. Read this index, then the matching feature file.

## Baseline preconditions

- Node 22.x (`node --version`, root `engines.node`).
- `node tools/verify/cli.mjs doctor --json` exits 0.
- For serve/fetch/mcp: root `npm ci` so Express is present. For SPA shells: `npm run build`.
- Never drive live `https://samedaydesk.com` as success from a CDN-challenged VM.
- Never pay Stripe/x402/Fix Pack, never POST `PAYMENT-SIGNATURE`, never `tools/call`.

## Driving conventions

- Start from the repo root. JSON stdout, human stderr.
- Treat commands as literal. Keep `--` child argv unchanged.
- Local fetch uses loopback `serve start` origin.
- MCP: shipped `node server/index.js` + `initialize` then `tools/list` before any call.
- Live gateway MCP: cite Pilot `tools/ops/verify-samedaydesk-mcp.mjs` (`boundary.toolsCalled:false`).
- Archive dest and extract dirs must be **outside** this git tree.

## Proof and skip reporting

- Quote the command, exit code, and envelope `ok`/`error.code`.
- HTTP proof includes status, content-type, and a body preview.
- MCP proof includes the five tool names and `boundary.toolsCalled=false`.
- Apex hcdn 403 is `cdn_challenge`, not product 200.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each file: H1, one paragraph, a compact field table (`goal`, `entrypoint`, `command`, `state`, `tests`, `prerequisite`), then exactly four H2s: **Sub-features**, **How to get to it (user POV)**, **Driving it with verify-cli**, **Gotchas**.

## Features

- [useful-jobs](./useful-jobs.md) — exact caller files → json+md; `bin/useful-jobs.mjs list`.
- [archive-acquisition](./archive-acquisition.md) — 1.4.7 bytes+sha outside the repo; 1.1.0 negative control.
- [offline-packs](./offline-packs.md) — s176 record-repeat and s185 distribution-repair, local files only.
- [apex-mcp](./apex-mcp.md) — shipped Express `/mcp` five tools; no `tools/call`.
- [x402-unpaid-discovery](./x402-unpaid-discovery.md) — gateway docs + GET `/extract` HTTP 402.
- [hosted-readback](./hosted-readback.md) — `npm start` → `node server/index.js`; `/api/health`.
- [for-agents-cold-read](./for-agents-cold-read.md) — `preferFixture:true` → `offline_fixture`.
- [offer-routing](./offer-routing.md) — job → existing offer; complete-issue refuses.
- [result-reuse](./result-reuse.md) — already-held JSON → observation; `--opt-in` required to write.
- [recurring-recipes](./recurring-recipes.md) — one-shot prior vs current; payment replay blocked.
