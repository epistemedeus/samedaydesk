# W5-D17 HTTP response-contract

Schema `samedaydesk.wave5.d17.http-response-validation.v1`. Thin extension of
merchant paid-success capture at x402-url-extractor `a143898d`. Not a second
ledger. Not MCP identity.

## Canonical HTTP body contracts

Runtime validation loads `src/canonical-contracts.generated.json`, a pin-time
export of the merchant serving contracts. It does not import `extract.mjs`
(that module performs fetches). H01 same-repo binds the live parsers.

| HTTP route | Body producer | Schema that describes the HTTP success body |
| --- | --- | --- |
| GET `/extract` | `server.js` `res.json(await extract(url))` | `extractMcpOutputSchema` (Zod). Named MCP because the MCP tool reuses the same object. |
| GET `/read` | `res.json(await readMarkdown(url))` | `readMcpOutputSchema` |
| POST `/extract/batch` | OpenAPI `extractBatchOutputSchema()` | **JSON Schema** `extractBatchOutputSchema()`. MCP uses a Zod sibling `extractBatchMcpOutputSchema`. HTTP validation must not use the MCP Zod object. |

Catch `ok: false` envelopes (timeout, `unsupported_encoding`, fetch/redirect)
are produced at merchant HTTP 200 and sit **outside** the success Zod schema.
Those envelopes are classified by `error.code`, not as success-schema pass.

Unsupported method/resource (`PUT /extract`, `GET /scan`) stays
`unknown` / `unsupported_target`. It is not an invalid extract success.

## Historical v1 (do not drop)

Merchant `commerce-paid-success-evidence.ndjson` rows with `v: 1` and
`validatorVerdict: not_checked` / `validatorAuthority: none` /
`validatorSource: http_runtime_not_checked` remain historical even if a later
merchant constant equals `validated`. Extra optional keys on those rows do
not drop them.

Join key: `method` + `route`/`resource` + `responseDigest`.

## Layers (do not collapse)

1. **Merchant transport** — actual HTTP status on the paid response.
   Completed delivery requires a 2xx integer status. A success-schema body
   inside HTTP 500 is `merchant_http_failure`, not `pass` /
   `full_bounded_capture`.
2. **Declared-schema conformance** — `schemaConformance` on the evaluator
   (`holds` / `fails` / `not_applicable`). Stored as bounded
   `counters.schemaErrors` (0 means holds when applicable). Shape is not
   buyer usefulness.
3. **Domain capture** — source refusal, truncation, or full bounded capture.
   `usefulness` stays `unknown`.

Truncation and source refusal may coexist. Principal `deliveryClass` is
`source_refusal` when `sourceOk === false` on a completed 2xx success
envelope. `counters.truncateMarks` and `counters.sourceRefusalMarks` both
remain. Do not report `truncated_partial` as the class in that case.

## Delivery class (principal outcome)

| `deliveryClass` | Meaning |
| --- | --- |
| `full_bounded_capture` | Merchant HTTP 2xx, declared success schema holds, source accepted, no truncation/oversized marks. |
| `source_refusal` | Merchant HTTP 2xx, success schema holds, `sourceOk: false`. Truncation marks may also be set. |
| `truncated_partial` | Merchant HTTP 2xx, success schema holds, truncation/partial/oversized, source not refused. |
| `unsupported_content` | Typed catch envelope `unsupported_encoding` (success schema fails). |
| `transport_failure` | Typed catch envelope `timeout`. |
| `engine_failure` | Typed fetch/redirect/invalid_response/ssrf catch. |
| `malformed_body` | Bytes present; JSON or declared success schema fails (and not a typed catch). |
| `missing_body` | No bytes. Verdict `unknown`. |
| `merchant_http_failure` | Merchant HTTP status missing or not 2xx. Schema may still hold. Not completed delivery. |
| `unsupported_target` | Method/resource is not GET `/extract`, GET `/read`, or POST `/extract/batch`. Verdict `unknown`. |

HTTP 200 and nonempty text do not imply `full_bounded_capture` or useful
delivery. Missing/malformed body is never `pass`. Observed bodies larger
than `MAX_RESPONSE_BYTES` (10,485,760) are digested in full, stored length
is clamped, and the class is never `full_bounded_capture`.

## Settlement class

| `settlementClass` | Meaning |
| --- | --- |
| `simulated` | Fake facilitator / test payment. Not revenue. |
| `unpaid` | Challenge or no settlement. |
| `real_unverified` | Chain hash may exist; not buyer-attested usefulness. |

## Counters (bounded 0-99)

`schemaErrors`, `requiredPresent`, `truncateMarks`, `sourceRefusalMarks`.
Missing `sourceRefusalMarks` on read defaults to 0. Store rows keep only
counts, digests, outcome, and refs. No private response bytes, parsed bodies,
or unbounded error strings.

## Invoke

```bash
node experiments/wave5/d17/http-delivery-evidence/bin/validate-http-delivery.mjs \
  --method GET --resource /extract --bytes-file /tmp/extract-body.bin \
  --merchant-http-status 200 --settlement-class simulated --store-dir /tmp/d17-http
```
