# Harbor catalog page workflow

One consumer journey for a held public catalog page. A fitting case runs four existing pieces and writes a portable result:

1. The owned native job `page-change-offline-job` from the useful-jobs 1.4.7 archive, through the capability lookup in `server/lib/observatory/maintained-capability.js` (`1003b9ec6c3d46826f54a398fce4bb6d0821596f`).
2. The direct source-change decision in `tools/result-reuse` (`da769f7870e494bb583e31766a477a2ff974fc10`). The producer is `tools/recurring-job-recipes/recipes/source-change-alert.mjs` (`200d6765480f5babd4c9c61e01a0b3d2ac988757`). On a reuse hit the producer is not started.
3. The Dify table checker `h64314.table_csv.v1` from `epistemedeus/dify-table-csv` at `a31b79541838c3d0023ee1af6150fae8a7e1cb8d`, called in process. Dify is not started.
4. The Ghost published-post projection from `epistemedeus/ghost-continuity` at `3f0b25b57dc4639892899ba34439dbb6d9f67938`, applied to `catalog.json` inside this install. Ghost is not started.

Dify and Ghost are not in this repository's history. The bytes used here are the copies under `assets/`, pinned in `PINS.json`. `epistemedeus/neomorphic-io` was not readable from this run, so byte equality with that private tree is unknown.

A case that does not fit returns one direct route and runs none of the four. An unknown job id stays unselected. A live fetch, a content API, or an install request names the direct command for that one product and does not run it. Two live requests stay unselected. A private field is rejected and is not copied.

## Normal use

```sh
node experiments/n4-workflow-distribution-20261104/bin/workflow.mjs install --state /tmp/n4-workflow-distribution --clock 2026-11-04T22:00:00.000Z
node experiments/n4-workflow-distribution-20261104/bin/workflow.mjs run --state /tmp/n4-workflow-distribution --input experiments/n4-workflow-distribution-20261104/fixtures/case.json --out /tmp/n4-workflow-distribution/out
```

`install`, `update`, and `remove` change only the state directory. `update` refreshes the extracted kit and keeps `catalog.json`. `remove` deletes the state directory and leaves the repository bytes in place.

The portable result is `out/result.json`. When the decision is bound or reused, `out/bound-observation.json` is the artifact for the next caller. That caller is a later `decide-or-reuse` with the same before-work manifest. The command is in `result.transfer.command`. This workflow does not send it.

`result.reuse.liveMetric.distinctLaterAcceptedTasksTakingReuse` stays null. `recomputeCostAvoidedNetOfUpkeep` stays `costs_unknown`. A reuse hit still runs the page-change job and the table checker. This workflow does not treat producer absence as saved cost.

## Check

```sh
node --test --test-concurrency=1 experiments/n4-workflow-distribution-20261104/test/journey.test.mjs
```

The test compiles `observer/trace-exec.c` with gcc and traces exec of the workflow process. That tracer is not part of install or run. The passing run is this author's check. It is not a later consumer.
