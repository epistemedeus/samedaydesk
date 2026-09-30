# Agent-readiness conformance

Offline checker for discovery files, the MCP handshake and `tools/list`, cross-surface identity, CORS, the x402 manifest, and the agent card. The free page is `/tools/agent-readiness`. The API is `GET /api/tools/agent-readiness?url=` and `GET /api/tools/agent-readiness/baseline`.

The 2026-09-24 baseline is a structural pin. The clone had no separate audit file from that date. Captures are reduced from the public read on 2026-09-30 and the 2026-09-03 presence pin. x402 item count is evidence, not a score input. A presented document with the wrong shape fails closed and is not scored as a pass.

```
node tools/agent-readiness/cli.mjs --baseline
node tools/agent-readiness/cli.mjs --coverage
node tools/agent-readiness/cli.mjs --seeded-failure held-out-seed
node --test tools/agent-readiness/test.mjs
```

`--baseline` exits 0 when the eight hosts match `baseline/2026-09-24.json` (136 coverage rows) and the held-out fixture scores differently from the apex. `--seeded-failure` exits 1. That exit is the rejection. `rejected` is true and `failClosed` names the stable code.

`--live` is optional and reads only `samedaydesk.com`, `agents.samedaydesk.com`, `ein.llc`, and `neomorphic.io`. It does not pay, sign, or call a paid route body. It is not part of the default test.

No Hostinger action. No prices. No secrets.
