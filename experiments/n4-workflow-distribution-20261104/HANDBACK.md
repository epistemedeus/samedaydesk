# N4-WORKFLOW-DISTRIBUTION handback

Owner role: Pilot Agent Growth Loops Nov4.

Branch: `codex/n4-workflow-distribution-20261104`

Base: `f4fba79fda839e8bfbad47b2b6883d8c2c9791a9` (PR356 head). This branch does not edit that tree.

Workflow commit: `7a47f4d7c2bda0d50f6a017b43201b201c99cfd3`

Workflow tree: `0f75985168abe2509c10959598796fad477ed84a`

Head: the child commit that adds this file and `RESULT.md`. Its parent is the workflow commit above. The child does not change the workflow. A file cannot contain the hash of the commit that adds it, so the head SHA is the value of `git rev-parse HEAD` on this branch after that child commit.

Pull request: none. A draft into `codex/h136010-machine-release-20261103` would carry every file PR356 composed, because this branch starts at PR356 head. A pull request into `codex/nov04-qualified-reuse-integration` was not opened. No shared file was changed, so there is nothing separable to put on another base.

## What runs

One fitting case, `fixtures/case.json`, is a held public catalog page. The journey does four things:

1. Looks up `page-change-offline-job` and runs that owned command in the extracted useful-jobs 1.4.7 kit.
2. Binds the direct `source-change-alert` decision with `tools/result-reuse/cli.mjs decide-or-reuse`. The command never passes `--producer`. On a later run with the same before-work manifest and the saved observation, the producer process is absent. The page-change job and the table checker still run.
3. Calls `h64314.table_csv.v1` on the held reader record. Dify is not started.
4. Projects public published Ghost posts into `catalog.json` inside the state directory. A members post is ignored. Ghost is not started.

`install`, `update`, and `remove` change only the state directory. `update` refreshes the kit and keeps the catalog. `remove` deletes the state directory and leaves the repository bytes in place.

A case that does not fit returns one direct route and runs none of the four. Unknown job ids stay unselected. One live fetch names `python3 src/direct_csv.py` from the Dify export and does not run it. One content API or Ghost install request names `node job/bin/demo.mjs` from the Ghost export and does not run it. Two live requests stay unselected. A private field is rejected and is not copied. Missing opt-in names the source-change-alert command and does not run it. A stale prior is withheld and is not bound. Withdrawing opt-in runs the producer again and does not return the old decision as reuse.

## Accepted assets

In this repository:

- EMBED `server/lib/observatory/maintained-capability.js` at `1003b9ec6c3d46826f54a398fce4bb6d0821596f`
- RECUR `tools/result-reuse/cli.mjs` at `da769f7870e494bb583e31766a477a2ff974fc10` (direct recipe building block)
- Native recipe `tools/recurring-job-recipes/recipes/source-change-alert.mjs` at `200d6765480f5babd4c9c61e01a0b3d2ac988757`
- Native archive `client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz` at `51b950f045555be8965eaeb6fc713e247a0ebdd7`, sha256 `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec`

Not in this repository's history. Copies live under this experiment and match the public export bytes in `PINS.json`:

- Dify checker `epistemedeus/dify-table-csv` at `a31b79541838c3d0023ee1af6150fae8a7e1cb8d`, files under `assets/dify/`
- Ghost projection `epistemedeus/ghost-continuity` at `3f0b25b57dc4639892899ba34439dbb6d9f67938`, files under `assets/ghost/`

`experiments/agl-contribution-delegation-20261104` was read and was not used as the transfer target.

## Changed paths

No file outside `experiments/n4-workflow-distribution-20261104/` was changed.

Workflow commit, 31 files:

- `PINS.json`
- `README.md`
- `assets/dify/LICENSE`
- `assets/dify/SOURCE-NOTICE.txt`
- `assets/dify/reader-table-csv.dsl.yml`
- `assets/dify/table_csv.py`
- `assets/ghost/LICENSE`
- `assets/ghost/SOURCE-NOTICE.txt`
- `assets/ghost/destination.mjs`
- `assets/ghost/ghost-v6.73.json`
- `assets/ghost/sync.mjs`
- `bin/workflow.mjs`
- `fixtures/after.json`
- `fixtures/before-work.json`
- `fixtures/before.json`
- `fixtures/capture-changed.json`
- `fixtures/capture.json`
- `fixtures/case.json`
- `fixtures/ghost-posts.json`
- `fixtures/page-job.json`
- `fixtures/prior.json`
- `fixtures/reader-record.json`
- `fixtures/reader-spans.json`
- `observer/trace-exec.c`
- `src/fit.mjs`
- `src/journey.mjs`
- `src/paths.mjs`
- `src/pins.mjs`
- `src/state.mjs`
- `src/table_check.py`
- `test/journey.test.mjs`

Child commit adds `HANDBACK.md` and `RESULT.md`.

## Tests

Command:

```sh
node --test --test-concurrency=1 experiments/n4-workflow-distribution-20261104/test/journey.test.mjs
```

Exit code 0.

```
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3033.252723
```

The reuse test traces exec with `observer/trace-exec.c`. The produce trace contains `source-change-alert`. The reuse trace contains `useful-jobs.mjs`, `table_check.py`, and `result-reuse/cli.mjs`, and does not contain `source-change-alert`. That trace is this author's test process. It is not a later consumer. `distinctLaterAcceptedTasksTakingReuse` is null. `recomputeCostAvoidedNetOfUpkeep` is `costs_unknown`. Producer absence is not recorded as saved cost, because the page-change job and the checker still run, and no independent cost was observed.

## Normal next use

```sh
node experiments/n4-workflow-distribution-20261104/bin/workflow.mjs install --state /tmp/n4-workflow-distribution --clock 2026-11-04T22:00:00.000Z
node experiments/n4-workflow-distribution-20261104/bin/workflow.mjs run --state /tmp/n4-workflow-distribution --input experiments/n4-workflow-distribution-20261104/fixtures/case.json --out /tmp/n4-workflow-distribution/out
```

The author ran that pair once. The result was `delivered`, reuse verdict `bound`, outcome `unchanged`, and `transfer.sent` false. That run is not independent use.

## Next consumer

Target: a later caller of `tools/result-reuse/cli.mjs decide-or-reuse` with the same before-work manifest.

Artifact: `out/bound-observation.json`.

The command is `result.transfer.command`. It was not sent. Whether that later caller exists is unknown.

## Dependencies

- The four in-repo assets named above, plus Node, Python 3, and `tar` for the kit extract.
- gcc is used only by the test, to compile the exec tracer.
- The public Dify and Ghost commits named above.
- The Dify runtime and a Ghost server are not dependencies. Neither is started.

## Unknowns

- No distinct later accepted task has taken this reuse. The metric is null. Unknown is not zero.
- Net recompute cost avoided, after upkeep, is `costs_unknown`.
- This author's runs are not outside useful execution, hosted execution, or revenue.
- Dify and Ghost have no commit in samedaydesk history. The copies are the public exports only.
- Byte equality with `epistemedeus/neomorphic-io` `examples/dify-table-csv` and `examples/ghost-continuity` is unknown. That repository was not readable from this run (`gh` returned 404). The public SOURCE-NOTICE files name it as upstream.
- No pull request is open.
