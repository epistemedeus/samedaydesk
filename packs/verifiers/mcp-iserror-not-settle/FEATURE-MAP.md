# Feature map — SDS MCP isError ≠ settle verifier

Write boundary: `packs/verifiers/mcp-iserror-not-settle/**` only.

| ID | Intent | This pack | Status |
| --- | --- | --- | --- |
| iserror-not-settle | MCP `result.isError` is never settlement | `src/classify.mjs`, `bin/verify.mjs` | Implemented |
| committed pin | Record `server/routes/mcp.js` sha256 + okMsg envelope | `src/committed.mjs`, `src/source.mjs` | Implemented |
| seeded HTTP 200 claim | Unpaid Fix Pack `isError` claimed settled because transport succeeded | `fixtures/fail/sds-http-200-unpaid-fixpack-claimed-settle.json` | Implemented |
| naive 2xx contrast | HTTP 2xx + JSON-RPC result would bank the seeded file | `src/naive.mjs` | Implemented |

## Explicitly not this pack

- Editing `server/routes/mcp.js` or MCP tool inventory
- Live `POST` to SDS `/mcp`, Stripe license retrieve, x402 spend
- Proving on-chain settlement when `isError` is absent
- Publishing, deploying, or touching neomorphic-io
