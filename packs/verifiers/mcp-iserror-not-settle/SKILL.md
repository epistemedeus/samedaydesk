---
name: mcp-iserror-not-settle
description: Offline SameDayDesk verifier that refuses to treat MCP isError true, JSON-RPC errors, or HTTP 200 as settlement. Run the bundled suite or a caller case file. No live, pay, or publish flags.
---

# mcp-iserror-not-settle

Cold-agent skill for the SameDayDesk MCP isError≠settle verifier.

## Cold start

```bash
node packs/verifiers/mcp-iserror-not-settle/bin/verify.mjs --suite
```

From this pack directory:

```bash
node bin/verify.mjs --suite
```

## Seeded failure

```bash
node packs/verifiers/mcp-iserror-not-settle/bin/verify.mjs --case \
  packs/verifiers/mcp-iserror-not-settle/fixtures/fail/sds-http-200-unpaid-fixpack-claimed-settle.json
```

Non-zero exit. `isError: true` plus a settle claim is rejected.

## Rules

- `result.isError` true (boolean, `"true"`, or `1`) is never settlement.
- JSON-RPC `error` is never settlement.
- HTTP 200 is the MCP transport, not a paid receipt.
- PaymentRequired challenges and settlement-failed `isError` results are not settle.
- Tool text that says a payment is verified does not override `isError`.
- Do not pass `--live`, `--pay`, `--publish`, or `--neo`.
- This verifier does not prove on-chain settlement when `isError` is absent.
