# Page-change brief

Offline compare of already-held `samedaydesk.extract-batch.v0` JSON. Does not fetch, pay, or import merchant `compare.mjs`.

- verdict: **changed**
- schema: pilot/page-change-brief/v1
- fields: title, description, headings
- clock: 2026-09-08T12:00:00.000Z
- freshness: unknown (current/fresh stay false unless a later owner proves currency)
- usefulOutputProven: true
- paymentImpliesUsefulOutput: false
- charged is not useful output

## Summary

| matched | missing | failed | unknown | coverageUnknown | semantic | order |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | 1 | 1 | 0 | 1 | 2 | 1 |

Job `rfq-and-vendor-page-watch`: Compare two previously delivered extract-batch JSON artifacts for selected RFQ fields.

## Changes

- semantic replace `/description` `https://rfq.example/widgets`
  - before: Offer due 2026-09-20. Unit price 12.40 USD.
  - after: Offer due 2026-09-27. Unit price 12.40 USD.
- order reorder `/headings/h2` `https://rfq.example/widgets`
  - before: ["Scope","Dates"]
  - after: ["Dates","Scope"]
- semantic replace `/title` `https://rfq.example/widgets`
  - before: Q3 widget RFQ
  - after: Q3 widget RFQ (deadline moved)

## Coverage unknown

Absent selected field is coverage unknown, not deletion.

- https://research.example/vendor-alpha description

## Incomplete rows

- missing before https://research.example/vendor-beta status=unknown
- failed https://rfq.example/fasteners before=success after=failure


termsVersion: `sha256:a51d5a25585a8dde706cdc954fa4fbc2aeed50b3599cfb8791c601eb5932c0f4`
engine: samedaydesk.page-change-offline-job@0.1.0
merchantCompareImported: false
networkUsed: false
