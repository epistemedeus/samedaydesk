# VF09 executable compound interface

See [result](../COMPOUND-RESULT.md), [ports](ports.json) and the
[detailed Heavy handoff](../VF09-HEAVY-RECEIVING-PLAN.md). This is the existing
correspondence host's opt-in extension, not a new public service.

From repository root on the remote Linux x64 receiving checkout:

```sh
npm run build --prefix services/correspondence
npm run setup --prefix scripts/visitor-foundry/execution
npm run build --prefix scripts/visitor-foundry/execution
node scripts/visitor-foundry/integration/run-local.mjs compound
node scripts/visitor-foundry/integration/run-local.mjs read-bench
```

Run compound and read-bench sequentially: compound deliberately alters/restores
its own runtime wrapper to test integrity failure. Runtime/toolchain absence is
a failure. The runners create owned disposable PostgreSQL clusters with fsync on;
they never consume a production DATABASE_URL. Preserve prior evidence with a
pre-created `VF04_EVIDENCE_DIR` when rerunning. `VF09_BENCH_LABEL` controls the
benchmark JSON suffix; the final after measurement is retained under compound
receipts. The earlier source is retained as `store-before-profile-dedup.txt` only
for audit; it is not another installed module.

## CLI

`node scripts/visitor-foundry/integration/compound/visitor.mjs MODE CONFIG INPUT`
supports use, decline, contribute, resume and reconcile. CONFIG names `baseUrl`,
`projectId`, and `tokenFile` containing a normal existing project grant. A fresh
B needs just those fields and its canonical VF01 task JSON, for example:

```json
{
  "schema":"neomorphic.foundry.capability-request.v1",
  "taskId":"task:my-current-task",
  "outcome":"compact-correspondence-structured-result",
  "input":{"structuredContent":{"example":"my actual payload"}},
  "environment":{"platform":"linux","arch":"x64","executionProfile":"vf08.wasmtime49-linux-x64-fixed.v1"},
  "output":null,
  "capabilityId":null
}
```

This example input is not one of the qualified owner-QA cases, so supported
invocation remains unavailable until there is exact applicable evidence. No
whole-interface compatibility is implied by the JSON shape.

For contribute, CONFIG additionally names `identityKeyFile`, `stateDir` and
`standingScope:"synthetic-reusable-components"`, under current installed terms.
It uses a writer grant, locally builds/executes the received C example, uploads
its explicit reusable bytes and seals each mutation to disk before sending.
`resume` takes the returned participation-hint JSON. `reconcile` takes the exact
persisted intent JSON; both require the original local identity key and normal
access. Resume only reads. Reconcile rechecks terms/grant and replays the same
request; it never silently creates a new lease or submission.

Credential files must be private (0600) and at most 4KiB; config/task files and
HTTP responses are bounded. Redirects are refused. JSON metrics count body bytes,
not credentials, HTTP headers, TLS overhead, compiler work or model tokens.
Do not publish local intent/key/token files. The receipt contains a cell locator,
not the authority to read or mutate it.
