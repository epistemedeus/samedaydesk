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

## Measured on this amend

`npm run foundry:cold` exited 0. Visitor A task acceptance exited 0 with `taskResult` true and `durableRetrieval` false. After the HTTP restart, visitor B's durable acceptance exited 0 with both true. The later readback selected candidate `candidate:2afce79068cbcab275211f670e6206ec7c1f4e8364e948043a0c573a4ed10546`, generation 1, manifest `sha256:ad300dc8fc60bd865447116966a8f4239d1124c98cfae317ef3f34775c8f7bec`. Wasmtime was `49.0.0`, held-out case `case:project-created`, outcome `observed`. Rollback kept the schema and the published row. The seeded unbound task inside that command exited 2 `task_claim_without_result`.

`node server/foundry/activation/postdeploy-accept.mjs --fixture server/foundry/activation/fixtures/seeded-unbound-task.json --require task` exited 2. `hostedDiscovery` was true, `taskResult` was false, and `durableRetrieval` was false.

`node server/foundry/activation/delta.mjs --live` exited 0 with `liveAgrees` true, `currentPublicState` `disabled_optional_mount`, and `activationPackageOnMain` false. `client-compat.mjs --origin https://samedaydesk.com` exited 0 as `public_client_compatible_foundry_inactive`.

## Host delta

This amend does not set Hostinger variables, enroll a correspondence Postgres URL, migrate production, restart the hosted process, or change routes, copy, or prices. The public mount remains the disabled optional mount in `DELTA.md`. Root still authorizes a separate Postgres URL, runs `server/foundry/install.mjs`, sets the serving names, and restarts `node server/index.js`. `FOUNDRY_PRODUCTION_ACTIVATE` stays unset or `HOLD`.
