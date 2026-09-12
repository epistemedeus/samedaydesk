# W5-D17 HTTP delivery evidence RECEIPT

**Slot:** W5-D17 (HTTP extension, authority-gap fix)
**Repo:** epistemedeus/samedaydesk
**Branch:** `cursor/w5-d17-domain-outcome-contract-tests-for-successful-change-no-change-refusal-reports-5d04`
**Tested head:** `2885bd86be95f89f1ae6cc0363f10f03aaeff164`
**Owned path:** `experiments/wave5/d17/http-delivery-evidence/` only
**Merchant pin:** epistemedeus/x402-url-extractor `a143898dd1ec35c097ca7eb0b472f30dad1ee319` (PR54)
**Canonical HTTP sources:** `extractMcpOutputSchema`, `readMcpOutputSchema`, `extractBatchOutputSchema()` (not `extractBatchMcpOutputSchema`)
**SDS wrapper pin (orthogonal):** `aeef964fa188443078958d9d6d393afae1d542ee`
**Model:** Cursor Grok 4.6 xhigh (run `bc-b5089168-89b2-4bde-9493-07b8c06cbaff`)

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/d17/http-delivery-evidence/test/*.test.mjs
```

**PASS** — 20 pass, 0 fail, 0 skipped (Node v22.14.0). Real disposable merchant
process plus fake xpay facilitator. Not mocks of extract. Postgres unused; not a
skipped gate.

| Case | Result |
| --- | --- |
| Live `extractMcpOutputSchema.safeParse` vs generated adapter | agree on valid extract, 403 success envelope, timeout catch (outside success schema) |
| HTTP batch vs MCP Zod | extra quote field holds on `extractBatchOutputSchema()`, fails MCP snapshot |
| HTTP 200 + nonempty text without declared fields | `invalid` / `malformed_body` |
| Missing / malformed body | `unknown` / `invalid`, never `pass` |
| Declared extract of public example HTML | `pass` / `full_bounded_capture`, `usefulness: unknown` |
| External 403 HTML with block copy | `pass` / `source_refusal`; live Zod holds |
| Source refusal plus truncation | principal `source_refusal`; both bounded counters set |
| Schema-shaped HTTP 500 | `invalid` / `merchant_http_failure`, not `pass` |
| PUT `/extract` and GET `/scan` | `unknown` / `unsupported_target` |
| Text excerpt truncation | `truncated_partial` |
| `unsupported_encoding` | `unsupported_content`; live Zod fails |
| Source timeout | `transport_failure`; live Zod fails |
| Bounded oversized capture | stored length clamped; never `full_bounded_capture` |
| Caller SHA-256(domain \|\| bytes) | equals merchant retained `responseDigest` |
| Historical v1 `not_checked` with current constant `validated` | still readable and joined |
| Store canonicalization | counts/digests/outcome/refs only; non-finite fields rejected |
| Restart/readback | old v1 row and new validation file both survive |
| Fake facilitator settle `0x333…` | `settlementClass: simulated`, not revenue |

## Production finding (Root)

Four actual GET `/extract` purchases, 5000 atomic USDC each = 0.005 USDC
(not 5000 USDC), external HTTP, direct-or-unattributed,
`payerClass: unclassified`, `validatorVerdict: not_checked`.
Real paid requests. They do not establish useful buyer delivery or identity.
This package does not embed those private bodies or add a ledger line.

## Integration seam

`SEAM.md`. H01 copies `src/` into the merchant repo and binds same-repo
schemas. Do not import this SDS experiment path in production. Keep v1
`not_checked` rows; append optional `http-response-validation.v1.ndjson`
from the same bytes already hashed. Root joins on method + resource + digest.

## Unverified

- Live production bodies for the four purchases (not available, not needed).
- H01 has not applied the seam; merchant `isCanonicalPaidSuccessEvidence` still
  requires `not_checked`.
- Buyer-attested usefulness, classified payers, and independent demand.
- MCP typed telemetry (intentionally not used as HTTP identity).

No default-branch push, deploy, spend, API billing, extra Cloud workers,
overage, or usage reset.
