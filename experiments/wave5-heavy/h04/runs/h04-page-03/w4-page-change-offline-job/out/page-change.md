# Page-change brief

Offline compare of already-held `samedaydesk.extract-batch.v0` JSON. Does not fetch, pay, or import merchant `compare.mjs`.

- verdict: **changed**
- schema: pilot/page-change-brief/v1
- fields: title, description, headings, text
- clock: 2026-09-08T12:00:00.000Z
- freshness: unknown (current/fresh stay false unless a later owner proves currency)
- usefulOutputProven: true
- paymentImpliesUsefulOutput: false
- charged is not useful output

## Summary

| matched | missing | failed | unknown | coverageUnknown | semantic | order |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 0 | 0 | 0 | 2 | 0 |

Job `h04-page-03`: Watch /x402/verified title, description, headings, and crawler paragraph.

## Changes

- semantic replace `/description` `https://samedaydesk.com/x402/verified`
  - before: Build-time inspection list of unpaid 402 terms, last check time, contract hash, and whether OpenAPI, the unpaid 402 output schema, and the CDP Bazaar row agree.
  - after: Build-time inspection list of current SameDayDesk unpaid 402 evidence, including an OpenAPI operation observation and matching fresh CDP Bazaar evidence.
- semantic replace `/text` `https://samedaydesk.com/x402/verified`
  - before: Each row records seller, route, unpaid 402 price and network, last check time, contract hash, and whether OpenAPI, the unpaid 402 output schema, and the CDP Bazaar row agree. The badge is verified, dr
  - after: Each row has a live unpaid 402 check and contract hash. It records whether the operation was observed in OpenAPI and whether a matching CDP Bazaar row was observed within seven days of the crawl. The 


termsVersion: `sha256:296ec2c3a044cea0d973f8abba8634e1432390b84e8c75b78d1605070be54f4b`
engine: samedaydesk.page-change-offline-job@0.1.0
merchantCompareImported: false
networkUsed: false
