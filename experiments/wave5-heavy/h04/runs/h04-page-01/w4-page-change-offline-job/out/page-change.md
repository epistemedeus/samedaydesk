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
| 1 | 0 | 0 | 0 | 0 | 3 | 0 |

Job `h04-page-01`: Watch JSON-LD validator title, description, and headings.

## Changes

- semantic replace `/description` `https://samedaydesk.com/tools/schema-validator.html`
  - before: Paste your JSON-LD structured data to validate it: catches JSON syntax errors, missing @context/@type, and missing recommended fields for common schema types (Organization, Product, FAQPage, Article, 
  - after: Paste JSON-LD to check JSON syntax, @context, @type, and recommended fields for common Schema.org types. Runs in your browser. Free, no signup.
- semantic replace `/headings/h1` `https://samedaydesk.com/tools/schema-validator.html`
  - before: ["JSON-LD / Schema Validator"]
  - after: ["Free JSON-LD Validator & Schema Checker"]
- semantic replace `/title` `https://samedaydesk.com/tools/schema-validator.html`
  - before: Free JSON-LD / Schema Validator: check your structured data for AI search | SameDayDesk
  - after: Free JSON-LD Validator & Schema Checker | SameDayDesk


termsVersion: `sha256:90f4ebd4e7845d70ae478884163b4a116d287d19bd48490d28433d7c456541de`
engine: samedaydesk.page-change-offline-job@0.1.0
merchantCompareImported: false
networkUsed: false
