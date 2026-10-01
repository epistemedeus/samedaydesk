# Bound task receipt

Review `COHORT6-RECEIVING-093121` foundry section, head `ccd685d028ae05cb6936e2d9e95f8d087110004f`. `productionActivate` stays **HOLD**.

## Finding

`factsFrom` set `taskResult` from hosted discovery, a published candidate id, equal portable output, and `invocationMatchesRequest`. It did not call `invocationSelectsCandidate`. A request-matching envelope with the same output and a different candidate or module was a successful task while `durableRetrieval` stayed false. `server/scripts/test-foundry-activation.js` asserted that false green.

## Fix

`taskResult` now requires `invocationSelectsCandidate(task.readback, task.request, task.candidateId)` and `task.invocation` equal to that canonical envelope. The readback binds candidate, generation, manifest, content, module digest, request, Wasmtime sample status, sample output, and observation id. When `task.clientWire` is present, `clientInvocationSelects` must agree. A missing client stdout does not by itself fail the task. A present stdout that is only the output does.

`durableRetrieval` still requires that task result, `processRestarted`, `databaseSurvived`, and the same selection on the later `retrieval.readback`. Visitor B's stdout is checked when `retrieval.clientWire` is present. A later readback can fail durable retrieval without erasing a task whose own readback selected the contribution. The two visitors do not have to share one invocation row.

The cold job records visitor A's canonical readback and stdout on the task, then visitor B's readback and stdout after the HTTP restart.

## What fails `--require task`

Wrong candidate id, wrong generation, wrong manifest, wrong content, wrong module digest, canned `sampleOutput`, mismatched observation id, an invocation that is not the canonical envelope, and equal output with no readback. `fixtures/seeded-unbound-task.json` claims `taskResult` without a readback and exits 2 `task_claim_without_result`. A bound task that has not restarted still exits 0 for `--require task` and fails `--require durable`.

## Host delta

This amend does not set Hostinger variables, enroll a correspondence Postgres URL, migrate production, restart the hosted process, or change routes, copy, or prices. The public mount remains the disabled optional mount in `DELTA.md`. Root still authorizes a separate Postgres URL, runs `server/foundry/install.mjs`, sets the serving names, and restarts `node server/index.js`. `FOUNDRY_PRODUCTION_ACTIVATE` stays unset or `HOLD`.
