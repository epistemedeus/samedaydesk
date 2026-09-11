# Page-change brief

Offline compare of already-held `samedaydesk.extract-batch.v0` JSON. Does not fetch, pay, or import merchant `compare.mjs`.

- verdict: **changed**
- schema: pilot/page-change-brief/v1
- fields: title, description, headings
- clock: 2026-09-11T12:00:00.000Z
- freshness: stale (claims.fresh stays false; current is only observed+complete)
- usefulOutputProven: true
- paymentImpliesUsefulOutput: false
- complete: true
- limitsHit: none
- charged is not useful output

## Summary

| matched | missing | failed | unknown | coverageUnknown | semantic | order |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 0 | 0 | 0 | 3 | 0 |

Job `h04-page-01`: Watch JSON-LD validator title, description, and headings.

## Changes

- semantic replace `/description` `https://samedaydesk.com/tools/schema-validator.html`
  - before: Paste your JSON-LD structured data to validate it: catches JSON syntax errors, missing @context/@type, and missing recommended fields for common schema types (Organization, Product, FAQPage, Article, 
  - after: Paste JSON-LD to check JSON syntax, @context, @type, and recommended fields for common Schema.org types. Runs in your browser. Free, no signup.
  - display excerpt truncated; comparison used the full selected-field values
- semantic replace `/headings/h1` `https://samedaydesk.com/tools/schema-validator.html`
  - before: ["JSON-LD / Schema Validator"]
  - after: ["Free JSON-LD Validator & Schema Checker"]
- semantic replace `/title` `https://samedaydesk.com/tools/schema-validator.html`
  - before: Free JSON-LD / Schema Validator: check your structured data for AI search | SameDayDesk
  - after: Free JSON-LD Validator & Schema Checker | SameDayDesk


termsVersion: `sha256:4f3b8f72a3a0334221fe32234b4d60ae1a925b2d765a90af884d416eb067c694`
engine: samedaydesk.page-change-offline-job@0.1.1
merchantCompareImported: false
networkUsed: false
