# W5-M12 RECEIPT — selected-offer capability/pricing description

**Task:** W5-M12  
**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `cursor/w5-m12-machine-readable-capability-pricing-description-for-the-selected-offer-b1b6`  
**Tested kit SHA:** `b0a7f738505c9466fc4196c578d193837223cd9f`  
**StartingRef:** `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52)  
**PR:** https://github.com/epistemedeus/samedaydesk/pull/97 (draft)  
**Pilot source:** `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`  
**Contract:** `samedaydesk.wave5.m12.offer.v1`  
**Offer id:** `sdd.useful-jobs.supplied-input`

## What

Thin consumer of SDS52 `runPaidOffer`, `catalog.json`, live price pins, and
discovery metadata. Emits a machine-readable offer description and verifies
advertised jobs, prices, and limits against the real wrapper CLI and loopback
`GET /offer`. Does not copy the wrapper or engines. Does not rewrite the
homepage or live catalog.

## Changed paths

- `experiments/wave5/m12/` only

## Current-source findings (SDS52 `aeef964`)

Reproduced from current files, not a future sibling:

1. Selected jobs are the six useful-jobs catalog ids. Identity is the job
   string, not catalog array position.
2. Live extract is `$0.005` / `payTo` `0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee`.
   Seller-integrity-audit is `$0.01`. Both are adjacent live products, not this
   offer.
3. Wrapper fixture `0.02` is labelled non-live and unpublished.
4. `purchaseAuthority` and `paidHostedClaim` stay false on discovery.
5. Identical before/after vendor-budget-impact is transport ok, analysis
   `informational`, delivery complete. Missing required inputs is a wrapper
   refusal, not an engine crash.
6. Catalog file digest and engine archive sha/bytes are different identities.

## Tests

```bash
cd experiments/wave5/m12 && node --test --test-concurrency=1 test/*.test.mjs
node experiments/wave5/m12/bin/describe.mjs
node experiments/wave5/m12/bin/verify.mjs
```

**PASS** — 13 pass, 0 fail, 0 skipped, 0 cancelled (`node --test`, Node v22).  
Suites: advertised-mismatch 7, cli-describe-verify 3, sibling-bindings 3.  
Verify CLI: 25/25 findings, exit 0. Includes real wrapper CLI list/run,
identical-input no-change, oversize limit, SAMPLE-not-a-sale, unknown-job,
and loopback HTTP GET /offer. Postgres unused. Missing deps were not skipped.

## Integration limits

- Tested implementation: SDS52 `runPaidOffer` at `aeef964fa188443078958d9d6d393afae1d542ee`.
  `createExecutor` / `samedaydesk.paid-useful-jobs.execution.v1` is **not** on
  this checkout. D01 remaining bind: PR 74 `codex/w5-d01-20260911`
  observed `6bed72dd22a396134aa5c957933b42c3a5746698`.
- W5-M01 `experiments/wave5/m01/selected-offer.json` unbound. Catalog set is
  SDS52 `catalog.json`.
- W5-D26 `experiments/wave5/d26/cost-floor.json` unbound. No proposed live price
  is advertised. A measured row without that file fails verify.
- Offer HTTP here is the description document, not D01 execution HTTP / D14.
- No live settlement, catalog publication, production deploy, or new spend.
- pstack: plugin cache has `poteto-mode` and `setup-pstack`;
  `~/.cursor/rules/pstack-models.mdc` absent; slash not invoked; no extra
  Cloud/Task agents. Parent model from run-info: Cursor Grok 4.6 xhigh.
