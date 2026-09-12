# P03-spdx-mit-html result

Status: **pass**. `NODE_OPTIONS=--max-old-space-size=768 node --test test/consumer.test.mjs` → 15 pass, 0 fail.

## Source

- Repo: `spdx/license-list-data`
- Path: `html/MIT.html` + `jsonld/MIT.jsonld`
- `f75839ee25cde2383fab299f6d8fc94a442f444b` (2024-12-19, publisher 3.0.0) → `7e10095e0c9028c9e7109df00d15db46411a3378` (2026-04-10, publisher 3.1.4)
- License record: CC-BY-3.0 (accessingLicenses.md tech report) AND original MIT license-text terms. Repo has no LICENSE file.

## Job

useful-jobs **1.4.0** `page-change-offline-job` on held `samedaydesk.extract-batch.v0` documents. Clock `2026-09-12T12:00:00.000Z`. `--example` refused. No network on the job path.

HTML is **not** extract-batch. Selected fields are a caller-owned projection (`title`, `headings`, `text`, `jsonLd`). CrossRef timestamps and blank-node ids are generator noise and were dropped from `jsonLd`.

## Engine vs witness

| Case | Engine | Witness | Agree |
| --- | --- | --- | --- |
| Positive (all four fields) | `changed` on `/text` and `/jsonLd/seeAlso`; `claims.fresh=false` | changed `text`, `jsonLd`; unchanged `title`, `headings` | yes |
| Control identical batches | `unchanged`, `noChangeProven` | no selected-field change | yes |
| Control title/headings on the real pair | `unchanged` | no change | yes |

Positive HTML fact: after snippet adds optional `on` after `without limitation`. JSON-LD `seeAlso` gains two listed URLs. Title/headings stay `MIT License`.

## Negatives

- missing clock → `clock_required` (exit 2)
- quote without `sources` → `quote_as_success` (exit 2)
- `--example` → `sample_as_delivered_watch` (exit 2)
- live URL as job `before` → `live_fetch_url` (exit 2)

## Honesty

No purchase authority, live fetch, payment, scheduler, SAMPLE-as-delivered, or token/profit claims. Engine unmodified. No regression artifact.

Receiving owner: H6D parent catalog + `bin/select-job.mjs`.
