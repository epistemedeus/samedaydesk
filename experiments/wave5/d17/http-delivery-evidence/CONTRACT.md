# W5-D17 HTTP response-contract

Schema `samedaydesk.wave5.d17.http-response-validation.v1`. Thin extension of
merchant paid-success capture at x402-url-extractor `a143898d`. Not a second
ledger. Not MCP identity.

## Historical v1 (do not drop)

Merchant `commerce-paid-success-evidence.ndjson` rows with `v: 1` and
`validatorVerdict: not_checked` / `validatorAuthority: none` /
`validatorSource: http_runtime_not_checked` remain historical even if a later
merchant constant equals `validated`. Extra optional keys on those rows do
not drop them.

Join key: `method` + `route`/`resource` + `responseDigest`.

## New optional record

One versioned sibling row per observed HTTP response. Bound to the exact
bytes the caller received (SHA-256 over merchant domain
`samedaydesk.commerce-paid-success-evidence.response.v1` plus those bytes).
Never a later reread. Never a fabricated digest.

Server schema validation is merchant-declared contract evidence. It is
not independent verification, operator identity, or buyer-attested
usefulness. `usefulness` stays `unknown`.

## Delivery class (one field)

| `deliveryClass` | Meaning |
| --- | --- |
| `full_bounded_capture` | Declared extract/read/batch success schema holds, source accepted, no truncation marks. |
| `source_refusal` | Schema holds; source HTTP refusal (`sourceOk: false`). Includes 403/error pages with nonempty text. |
| `truncated_partial` | Schema holds; body or text truncation or batch `partial`. |
| `unsupported_content` | Typed failure envelope `unsupported_encoding`. |
| `transport_failure` | Typed failure envelope `timeout`. |
| `engine_failure` | Typed fetch/redirect/invalid_response/ssrf failure. |
| `malformed_body` | Bytes present; JSON or declared success schema fails. |
| `missing_body` | No bytes. Verdict `unknown`. |

HTTP 200 and nonempty text do not imply `full_bounded_capture` or useful
delivery. Missing/malformed body is never `pass`.

## Settlement class

| `settlementClass` | Meaning |
| --- | --- |
| `simulated` | Fake facilitator / test payment. Not revenue. |
| `unpaid` | Challenge or no settlement. |
| `real_unverified` | Chain hash may exist; not buyer-attested usefulness. |

## Counters (bounded 0-99)

`schemaErrors`, `requiredPresent`, `truncateMarks`. No flag sprawl.

## Invoke

```bash
node experiments/wave5/d17/http-delivery-evidence/bin/validate-http-delivery.mjs \
  --method GET --resource /extract --bytes-file /tmp/extract-body.bin \
  --merchant-http-status 200 --settlement-class simulated --store-dir /tmp/d17-http
```
