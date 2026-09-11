# W5-D24 RECEIPT — clean-environment CLI/package consumer

**Task:** W5-D24  
**Repo:** `epistemedeus/samedaydesk`  
**Branch:** `cursor/w5-d24-clean-environment-cli-package-consumer-acceptance-ffdb`  
**StartingRef:** `aeef964fa188443078958d9d6d393afae1d542ee` (SDS PR52)  
**Pilot packet:** `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`

Tests and executed counts are filled after the first local-runtime run on this branch.

## Tested pins (not future siblings)

| Input | SHA / note |
| --- | --- |
| D01 | `6bed72dd22a396134aa5c957933b42c3a5746698` (`samedaydesk.paid-useful-jobs.execution.v1`, PR 74) |
| D07 | `5620dcda5a0cd25892914717f8680c12d887632d` (PR 77) |
| Co14 / D08 pin | `4641173163616b76608cbb3beb503f2d94369b25` (W5-D08 branch unpublished) |
| useful-jobs archive | `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` (2522418 bytes) |

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/d24/test/*.test.mjs
```

Pending first execution on this worker.
