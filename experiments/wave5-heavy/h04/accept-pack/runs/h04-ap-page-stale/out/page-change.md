# Page-change brief

Offline compare of already-held `samedaydesk.extract-batch.v0` JSON. Does not fetch, pay, or import merchant `compare.mjs`.

- verdict: **unchanged**
- schema: pilot/page-change-brief/v1
- fields: title, description, headings
- clock: 2026-09-12T12:00:00.000Z
- freshness: stale (claims.fresh stays false; current is only observed+complete)
- usefulOutputProven: true
- paymentImpliesUsefulOutput: false
- complete: true
- limitsHit: none
- charged is not useful output

## Summary

| matched | missing | failed | unknown | coverageUnknown | semantic | order |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 0 | 0 | 0 | 0 | 0 |

Job `h04-ap-page-stale`: Same /terms selected fields with provenance older than max-stale-ms.

No selected-field content changes recorded.


termsVersion: `sha256:94fadb38687faabfbce497d186d75a691817e85eae11e70ae98babb5c0b601e0`
engine: samedaydesk.page-change-offline-job@0.1.1
merchantCompareImported: false
networkUsed: false
