# RECEIPT — H04 page-facts examples

Owned dir: `experiments/wave5-heavy/h04/examples/page-facts/`  
Engine (read-only): `w4-page-change-offline-job` @ `91b57334818ecd7940cb854e9864f3b1749d1d1d` (`/tmp/w5-h04/ro-w4-pages`)  
CLI: `node tools/page-change-offline-job/bin/page-change.mjs job --job <job.json> --out-dir /tmp/w5-h04/h04-child-page-runs/<id>`  
Clock: `2026-09-11T12:00:00.000Z`

Not copied: `tools/page-change-offline-job/fixtures/*`, `tools/recurring-job-recipes/fixtures/merchant/page-change/*`, W4 SAMPLE RFQ / `rfq.example` / “Q3 widget RFQ”, W5-M09 page-snapshot corpora.

## Three examples

| id | kind | path | beforeSha | afterSha | expected | actual |
| --- | --- | --- | --- | --- | --- | --- |
| h04-page-01 | change | `client/public/tools/schema-validator.html` | `ff381d2b46e9beec1475212df2eb610a7b01229b` | `374a565784bcd4ec89eeda7fedbb9610fed77473` | changed | changed |
| h04-page-02 | no-change-control | `client/public/resources.html` | `ff381d2b46e9beec1475212df2eb610a7b01229b` | `542d1748060ffadeda2491ddbbf134db31ce2890` | unchanged | unchanged |
| h04-page-03 | change | `server/lib/spa-route-shells.js` (`/x402/verified`) | `3693e7c2ea49c44c8c8f35f24c3916de5b4bc8e0` | `3c96d3137f815035ed4a6467d28c8041916a9aa8` | changed | changed |

### Facts

1. **h04-page-01** — Buyer-visible rename: title, h1, and meta description move from “JSON-LD / Schema Validator” to “Free JSON-LD Validator & Schema Checker”. Engine: 3 semantic replaces (`/title`, `/headings/h1`, `/description`); `complete=true`; `paymentImpliesUsefulOutput=false`; `networkUsed=false`.
2. **h04-page-02** — Meaningful-no-change control. `542d174` only appends a footer sentence about EIN.LLC / Neomorphic.io. Selected `title` / `description` / `headings` identical. Wrapper also changes `jobId`, provenance times, unused `text` / `assetHash`. Engine: `verdict=unchanged`, `semantic=0`, `noChangeProven=true`. This is the useful-job vs dumb-diff control.
3. **h04-page-03** — Second real page-fact on a different path (option b, not source-list reorder). `/x402/verified` title and h1 stay; description + crawler paragraph replace “OpenAPI, unpaid 402 output schema, and CDP Bazaar row agree” with a matching Bazaar row observed within seven days. Engine: 2 semantic replaces (`/description`, `/text`).

`reordered` was not used: the third slot is a second HTML/source fact so the set stays nonduplicative. Engine still supports reorder; unused here.

## Engine runs

Out-dir: `/tmp/w5-h04/h04-child-page-runs/<id>/` (`page-change.json`, `page-change.md`). Copies: each example `actual-engine.json`.

| id | exit | verdict | semantic | order | complete | usefulOutputProven |
| --- | --- | --- | --- | --- | --- | --- |
| h04-page-01 | 0 | changed | 3 | 0 | true | true |
| h04-page-02 | 0 | unchanged | 0 | 0 | true | true |
| h04-page-03 | 0 | changed | 2 | 0 | true | true |

Failures: none. Refuses not triggered (no live URL, payment retry, quote-as-success, SAMPLE). Unknown stays unused.

## Honesty

- Extract-batch wrappers are caller-owned; facts match `git show SHA:path`.
- Homepage `client/index.html` L183 still uses the older “agree” blurb after `3c96d31`; the watched page is the `/x402/verified` route shell.
- `freshness` remains `unknown`; `current`/`fresh` stay false.
- `charged: false` on held wrappers; charged is not useful output.
