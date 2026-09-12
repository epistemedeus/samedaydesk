# W5-D17 HTTP response-contract evidence

Optional versioned validation bound to caller-observed HTTP response bytes
and the merchant extract/read/batch HTTP contracts. Sibling of the SDS52
domain outcome classifier. Does not edit `server/paid-useful-jobs` or the
merchant repo.

Canonical HTTP success bodies:

- GET `/extract` → `extractMcpOutputSchema` (same Zod object MCP reuses)
- GET `/read` → `readMcpOutputSchema`
- POST `/extract/batch` → `extractBatchOutputSchema()` JSON Schema, not the
  MCP Zod sibling

The runtime adapter loads `src/canonical-contracts.generated.json`. It does
not import merchant `extract.mjs` (fetch/url-guard side effects). H01 copies
this `src/` tree and binds the live same-repo parsers. See `SEAM.md`.

## Tests

From the SameDayDesk repository root:

```bash
node --test --test-concurrency=1 experiments/wave5/d17/http-delivery-evidence/test/*.test.mjs
```

Disposable merchant tests need a writable current-source checkout of
`epistemedeus/x402-url-extractor` at `a143898dd1ec35c097ca7eb0b472f30dad1ee319`
(`D17_MERCHANT_ROOT`, default `/tmp/x402-url-extractor-d17-run`) and the
read-only pin clone (`D17_MERCHANT_RO`, default `/tmp/x402-url-extractor-ro`).

## What this does not claim

Four production GET /extract purchases of 5000 atomic USDC each (0.005 USDC)
are real paid HTTP. They do not establish useful buyer delivery or identity.
This package does not add them to a revenue ledger and does not backfill
unknown bodies.

H01 integration seam: `SEAM.md`.
