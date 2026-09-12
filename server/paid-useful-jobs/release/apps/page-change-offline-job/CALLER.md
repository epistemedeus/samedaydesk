# page-change-offline-job - caller guide

Compare two already-held `samedaydesk.extract-batch.v0` JSON files on selected
fields. Does not fetch URLs, pay, or retry payment.

## Required inputs

| Flag | Meaning |
|------|---------|
| `--job` | Job document with `before`, `after`, `fields`, and `clock` |
| `--out-dir` | Directory for page-change.json / page-change.md |

`before` / `after` in the job file are relative to the job document.

## `--example` is refused

`--example` / SAMPLE is `sample_as_delivered_watch` (exit 2). Use a held job
document. Packaged caller files: `samples/page/h04-page-01/job.json`.

## Honesty

Live URL / `--fetch` refuses. Quote-as-success refuses. Clock is required.
`claims.fresh` stays false. This package does not start hosted extract.
`purchaseAuthority` is false.
