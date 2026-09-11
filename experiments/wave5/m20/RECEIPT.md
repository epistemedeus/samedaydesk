# W5-M20 RECEIPT — first-use / drop-off / repeat-job readout

**Task:** W5-M20  
**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `cursor/w5-m20-first-use-drop-off-and-repeat-job-readout-that-changes-the-next-offer-bb85`  
**Tested wrapper pin:** `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52)  
**StartingRef:** `aeef964fa188443078958d9d6d393afae1d542ee`  
**PR:** https://github.com/epistemedeus/samedaydesk/pull/109  
**Pilot packet:** `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`  
**Contract:** `samedaydesk.wave5.m20.readout.v1`

## What

Thin readout over PR52 `runPaidOffer`. Distinguishes no-reply, failed-use,
useful-use and paid-return. Recommends exactly one next offer change.
Owner-qa dry-run is labelled and is not independent demand. Fixture-funded
repeats are not paid return. Absent D27/M15-M19 receipts are sibling-pending.

## Changed paths

`experiments/wave5/m20/` only.

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/m20/test/*.test.mjs
```

**PASS** — 36 pass, 0 fail, 0 skipped, 0 cancelled. Node v22.14.0. Suites: classify
16, CLI process 8, loopback HTTP 1, next-offer 6, terms 3, PR52 dry-run 2.
CLI/HTTP/process tests spawn `bin/readout.mjs` and `bin/serve.mjs`. Dry-run
invokes `runPaidOffer` on caller vendor-budget fixtures (kit extract, not
skipped). Postgres is not required for this claim.

## Current-source findings (SDS52 `wrapper.mjs` at `aeef964`)

Reproduced from Pilot `REVIEW-INTEGRATION.md` against this checkout:

1. `sold` is always false. reserved-fixture is not a settled return.
2. SAMPLE / `--example` with reserved-fixture is `sample-not-a-sale`, not a sale.
3. Engine JSON `ok: false` is a domain refusal. Process status nonzero with no
   JSON is a transport crash. Those are different use classes.
4. `createExecutor` / `samedaydesk.paid-useful-jobs.execution.v1` is not on
   this checkout. D01 read-only `6bed72dd` publishes that contract.

## Next adjustment from owner-qa dry-run

`keep-current-pr52-nonsettling-offer`. Field receipts for D27 and M15-M19
are absent. Do not treat owner-qa or fixture repeats as paid return.

## Remaining live steps for Root / M01

1. Land D27 recruited-trial receipts under `experiments/wave5/d27/`.
2. Land M15-M19 trial receipts under their owned paths.
3. Re-run `node experiments/wave5/m20/bin/readout.mjs dry-run --buyer-class owner-qa`.
4. After D01 merge, re-run against `samedaydesk.paid-useful-jobs.execution.v1`.

## Integration limits

- Tested: PR52 `runPaidOffer` at `aeef964`. W4-commerce-16/03/06 consumed as
  closed-set / ownership pins, not copied.
- No live settlement, catalog publish, production deploy, new spend, or
  unsolicited messages.
- pstack: read `setup-pstack`, poteto-mode, prove-it-works, test-behavior,
  model-the-domain, laziness, boundary-discipline, build-the-lever. No
  `~/.cursor/rules/pstack-models.mdc`. No extra Cloud agents.
