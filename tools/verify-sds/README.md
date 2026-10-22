# SDS lab-verify

Offline SameDayDesk lab verifier. Cold clone, Node 22.x, no `npm install`, no payment, no MCP `tools/call`.

```bash
node tools/verify-sds/cli.mjs doctor --json
node tools/verify-sds/cli.mjs run --all --json
node tools/verify-sds/cli.mjs --seeded-failure stale-output --json
```

The three jobs are `useful-jobs` (1.4.7 kit hash + extract + `list --json`), `packs` (record-repeat / distribution-repair / consumer-repeat kit pins + distribution-repair `sample --positive`), and `mcp` (five shipped tool names from `server/lib/mcp-tool-inventory.js`).

Seeded stale receipts are rejected with exit 1 and `error.code` `STALE_OUTPUT`. Pins: `lib/pins.mjs`. Agent procedure: `SKILL.md`.
