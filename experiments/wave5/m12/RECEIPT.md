# W5-M12 RECEIPT — selected-offer capability/pricing description

**Task:** W5-M12  
**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `cursor/w5-m12-machine-readable-capability-pricing-description-for-the-selected-offer-b1b6`  
**StartingRef:** `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52)  
**Pilot source:** `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`  
**Contract:** `samedaydesk.wave5.m12.offer.v1`

## What

Thin consumer of SDS52 `runPaidOffer`, catalog.json, live price pins, and
discovery metadata. Emits a machine-readable offer description and verifies
advertised jobs/prices/limits against the real wrapper CLI. Does not copy the
wrapper or engines. Does not rewrite the homepage or live catalog.

## Changed paths

- `experiments/wave5/m12/` only

## Tests

Pending first execution on this revision. Command:

```bash
cd experiments/wave5/m12 && node --test --test-concurrency=1 test/*.test.mjs
```
