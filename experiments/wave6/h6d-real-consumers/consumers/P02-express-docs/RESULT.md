# P02-express-docs result

Status: **complete**. Tests: **12 pass / 0 fail** (`NODE_OPTIONS=--max-old-space-size=768 node --test test/consumer.test.mjs`).

## Source

- Official repo: `expressjs/expressjs.com` path `docs/content.md`
- Before: `ba98cc468032c95cb397b11895537b1c893ac63a` (2026-06-15 localized-links docs)
- After: `be31ea3fc5ba9e0d1b96d300894145ca4f6af57c` (2026-06-21 CodeTabs addition)
- License recorded: **CC-BY-4.0** (`LICENSE.md`), not MIT
- Retrieval: GitHub contents API + raw bodies, stored under `fixtures/raw/`. Not a live page fetch.

The only `docs/content.md` delta is insertion of `## Code Tabs` and dialect-tab documentation.

## Projection (labeled non-equivalent)

Markdown is not `samedaydesk.extract-batch.v0`. `md-facts.mjs` derives `title` / `headings` / `text` into held batches (`product: samedaydesk-extract-batch`, `charged: false`, clock required). Dropped: unselected markup, fenced code interiors, live freshness, payment.

## Engine vs witness

Independent witness (does not import kit compare):

- unchanged: `title` (`Content`)
- changed: `headings`, `text`
- added: `h2:Code Tabs`

useful-jobs 1.4.0 `page-change-offline-job` (engine 0.1.1):

- verdict **changed**, `claims.fresh` **false**, `usefulOutputProven` true, `complete` true
- semantic replaces at `/headings/h2` and `/text` (array replace of h2, not a per-item add — expected)
- control identical batches: verdict **unchanged**, `noChangeProven` true, `claims.fresh` false
- `--example` → `sample_as_delivered_watch`
- missing clock → `clock_required`
- `https://` before path → `live_fetch_url`

Engine agrees with the proven primary-source fact (Code Tabs heading added; title unchanged). No `regression-artifact.json`.

## Honesty

No live fetch on the job path. No payment, credits, or scheduler. `--example` is not a delivered watch. Not SDS schema-validator / resources / x402-verified pages.
