# V6 useful-job desk counterexamples

Black-box checks against the **existing** useful-jobs desk surface. A report
cannot claim delivered when a catalog-promised output file is missing.
Failures are **nonzero exit** and **parseable JSON**.

This directory is the only write boundary. It does **not** edit production
engines and does **not** own J6 `packs/useful-job-desk/**`.

Existing surfaces consumed (not invented):

| Surface | Path |
|---|---|
| Jobs catalog | `client/public/for-agents/useful-jobs/catalog.json` |
| Release archive | `client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz` |
| Desk CLI | `bin/useful-jobs.mjs` inside that archive |

## Property

`ok: true`, `status: "delivered"`, `delivered: true`, or
`delivery.complete` / `delivery.status: "complete"` is a delivery claim.
The catalog's `outputs` for that `jobId` must all exist as regular files
under the report's `outDir`. Missing even one file is
`missing_output_reported_delivered`.

A naive `if (report.ok) accept` would accept the seeded fixture. This
oracle does not.

Honest refusals (`ok: false` plus `error` or `code`) are parseable
failures, not deliveries.

## Commands

From the repository root, Node 22, no install:

```bash
node --test tests/v6-useful-job-desk-counterexamples/test/*.test.mjs
node tests/v6-useful-job-desk-counterexamples/bin/check-desk-report.mjs --seeded-fixture
node tests/v6-useful-job-desk-counterexamples/bin/check-desk-report.mjs --report tests/v6-useful-job-desk-counterexamples/fixtures/missing-output-reported-delivered/report.json
```

`--seeded-fixture` loads the committed missing-output-reported-delivered
case. Exit 2 with parseable JSON on stdout.

## Seeded failure

`fixtures/missing-output-reported-delivered/report.json` claims
`ok: true` / `status: "delivered"` / `delivered: true` for
`lockfile-pin-delta` while `out/` has none of `pin-delta.json` or
`pin-delta.md`.

## Kill / out of scope

- Edits to production engines (`engines/**`, packaged engine sources)
- J6 `packs/useful-job-desk/**` implementation
- Payment, publish, deploy, SKU/price changes
