# CW62 foundation handoff to native Grok Heavy

Status: **foundation, NOT READY**. Implementation and process acceptance remain.
Astra stopped at the explicit quota-reset closeout boundary. Do not infer readiness
from the historical D11/D12/D13 receipts, syntax checks, or the two smoke runs.
No full acceptance suite was run during closeout. No implementation remains authorized
for this Astra continuation after export/readback.

## Repository, ownership and next owner

- Repository: `epistemedeus/samedaydesk`.
- Feature branch: `codex/cw62-batch-value-integration-20260912`.
- One next integration owner: **native Grok Heavy, CW62 consumer integration**.
- Exclusive edit paths: `tools/job-request-desk/`, `tools/paid-batch-reconciler/`,
  `tools/buyer-value-ledger/`, `experiments/codex-window/cw62-batch-value-integration/`.
- Shared execution core, engines, other consumers, root manifests, releases and
  default branches remain read-only. Engine regressions require a witness to their
  owner; they do not grant CW62 permission to edit the engine.
- This export was made on **Grok VM / node_grok_bot_vm**, hostname `cursor`.
  It was not an actual Cursor Cloud VM. New substantial implementation belongs on
  the instructed actual Cursor Cloud host, using this Git export.
- Continue directly with native Grok Heavy. No nested model CLI or delegated
  inference was used in this Astra implementation.

A fresh VM can clone the feature branch, then work from the repository root:

```sh
git clone --single-branch --branch codex/cw62-batch-value-integration-20260912 \
  https://github.com/epistemedeus/samedaydesk.git samedaydesk
cd samedaydesk
```

The handoff, partial tests, fixture inputs, preserved receipts, smoke output bytes
and failure logs are all tracked repository-relative paths. Absolute paths inside
historical receipts identify past executions; they are not prerequisites.

## Exact source inputs and dependency mismatch

The isolated checkout started at **76f0fab6250cb8d9aaddaaaa3e4e3373ca2cc5be**.
Only the following completed consumer trees were imported, not their histories or
old shared runtime trees:

| Source | Exact ref | Imported tree |
| --- | --- | --- |
| D11 | `a03c7e41dfbd791e0adc872e65c33597e42c4193` | `tools/job-request-desk/` |
| D12 | `5f7b0f85dbacc6a1cfb2cc78308485340c9683f6` | `tools/paid-batch-reconciler/` |
| D13 | `b29ddce9b4cbe56fbdf5d7a756dc6e52b9b568df` | `tools/buyer-value-ledger/` |

Original package receipts remain unchanged. Original assignment receipts are in
`evidence/original/`. `evidence/closeout-source-manifest.json` records the original
blob and exported blob for every imported file and the unchanged shared tree IDs.
The shared dependency files had zero tracked modifications at closeout.

The new default execution path consumes the local shared
`server/paid-useful-jobs/lib/wrapper.mjs` `runPaidOffer` and contract
`samedaydesk.paid-useful-jobs.execution.v1`, at the original base above. It uses
existing `freezeRequest`, `engineProvenance`, and `digestNamedBytes` helpers.
It has NOT been rebound to later vendor-owner changes.

Read-only remote observations during closeout:

- `codex/useful-jobs-core-integration-20260912`: **30345f69f16aca93bb95511ee4da62975c98cc04**.
- Local remote-tracking copy of that branch: `a9aaa0f8a3bb996948e6033f743b62c4e5417882`.
- Remote `main`: `ad9bc7b448cf1f635ff1488affbe206aaf981ac0`.

Those later tips were not imported or tested. Recheck the vendor owner's completed
handoff before changing the consumer dependency baseline. A branch or hostname is
not evidence that this consumer was tested against the new core.

Stale exported compatibility metadata still names PR52
`aeef964fa188443078958d9d6d393afae1d542ee` in desk and batch `lib/pins.mjs`.
Other inherited kit/metadata helpers still describe the old archive. The original
I01 hashing fixtures retain `819fa637ecf5e5177c84efc16fcaa18d57017631` provenance.
Treat all of this as explicitly unfinished metadata/interface cleanup, not a
claim of current pin verification.

## Implemented foundation and interfaces

1. `tools/job-request-desk/lib/durable.mjs`: canonical digests and immutable JSON
   publication using an exclusive temporary file, fsync and hard-link creation.
   Existing differing documents conflict. This is trusted same-filesystem storage;
   multi-host and arbitrary untrusted filesystem attackers are not established.
2. `tools/job-request-desk/lib/store.mjs`: separate immutable admission, order
   identity, attempt and final documents. An existing attempt without a final
   result reads `unknown`; it never grants automatic takeover/retry.
3. `tools/job-request-desk/lib/desk.mjs`: synchronous `openDesk`, `createRequest`,
   `getRequest`, `listRequests`, plus exported `prepareRequest`. Request terms bind
   input digests, order, job, funding/payment declaration, buyer class and stated
   settlement. Core results and output bytes are checked; raw execution envelopes
   are retained. Directory and rewritten job-document inputs currently refuse as
   `unbound-input-shape` rather than pretending exact snapshot support.
4. `tools/job-request-desk/lib/current.mjs` and `bin/execute-current.mjs`: one thin
   process adapter to the current shared core, with optional loopback execution HTTP.
   The desk accepts `{ executionOrigin }`; the CLI accepts `--execution-origin`.
   There is no copied execution kernel or private financial balance.
5. `tools/paid-batch-reconciler/lib/ledger.mjs`: `runBatch(raw, options)` and
   `readBatch(batchId, options)`. `options.storeDir` is the durable root; otherwise
   outDir or a base-directory `.paid-batch-store` is used. An immutable manifest
   binds every planned item before dispatch. Duplicate manifest publication only
   reconciles; it does not resume dispatch. Counts distinguish completed,
   rejected, unknown and not-attempted rows. A partial batch has `ok: false`.
6. `tools/buyer-value-ledger/lib/run.mjs`: `measureRequest`, `measureBatch` and
   compatibility `runLabelledJob`. Measurement reads the existing desk ticket;
   the batch CLI accepts `batch --store DIR --batch-id ID --ledger FILE`.
   Value rows preserve request/attempt/result/settlement fields and always report
   `usefulPaidWork: false`, `jobRevenueUsdc: null`, no independent demand.
7. `tools/buyer-value-ledger/lib/ledger.mjs`: immutable event files at
   `<ledgerPath>.rows/<event hash>.json`; matching event replay deduplicates,
   conflicting payloads refuse, and distinct writers avoid replacing a whole
   JSON ledger. `loadLedger` reconstructs rows and retains older main-file rows.

The archive-spawning value adapter is disabled in the new default journey.
Inherited public exports, archive utilities, schema compatibility, documentation,
old injection seams and persistence helpers have NOT been fully reconciled.
The source is intentionally exported in this partial state.

## Evidence actually obtained

All paths below are relative to this experiment directory.

| Evidence | Actual result | Interpretation |
| --- | --- | --- |
| `evidence/imported-baseline.tap` | 39 tests, 24 pass, 15 fail, 0 skip | Imported consumer source against the pinned current checkout, before foundation edits. Genuine compatibility/behavior failures, not passing controls. |
| `evidence/desk-first.json` | caller vendor-budget request completed | One new-foundation smoke run through an actual core process. |
| `evidence/batch-first.json` | 2 rows: 1 completed, 1 rejected; status partial; ok false | One partial batch smoke run. Value chain was not validated. |
| `evidence/smoke-snapshots/` | exact copies of those two owned stores and output bytes | Preserved before removing the original owned `/tmp/cw62-*` smoke roots. |
| `evidence/acceptance-first.tap` | module load failed, exit 1 | New acceptance harness never reached a test body. |
| `evidence/closeout-import-reproducer.tap` | same module resolution failure, exit 1 | Narrow reproducible failure during closeout. |
| `evidence/closeout-syntax.json` | 75 of 75 owned `.mjs` files parse | Syntax only; not import, behavior or readiness validation. |

No current Postgres test ran. No expected-failing mutation-control pack was finished.
Keep future negative-control logs separate from readiness. A harness import failure
is an infrastructure failure, not a successful safety control.

The original baseline command was:

```sh
NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 \
  tools/job-request-desk/test/*.test.mjs \
  tools/paid-batch-reconciler/test/identity.test.mjs \
  tools/buyer-value-ledger/test/binding.test.mjs
```

It describes the preserved imported-source log. Running that command now exercises
changed source and is not expected to reproduce the same count.

The exact current, narrow failing reproducer is:

```sh
NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 \
  --test-name-pattern='current core -> desk -> batch -> value \(library\)' \
  experiments/codex-window/cw62-batch-value-integration/test/acceptance.test.mjs
```

It fails `ERR_MODULE_NOT_FOUND` before execution. Both new harness files use
`../../../../../` for repository paths, but their directory is only four levels
below the repository root. Their root URL calculation has the same off-by-one.
This known failure is deliberately left for the next implementation owner.

## Remaining work, in order, within exclusive paths

1. **Establish dependencies and restore harness imports.** Inspect the vendor
   owner's completed ref without editing its tree. Record a new tested dependency
   only after consuming it. Fix relative imports/root calculation in this
   experiment's `test/acceptance.test.mjs` and `test/worker.mjs`. Run the single
   library case first. Do not begin by running every inherited test.
2. **Review admission and immutable storage boundaries.** Audit
   `tools/job-request-desk/lib/{desk,store,current,durable}.mjs` for byte overrides,
   malformed requests, corrupt/missing admission/order/final files, exceptions
   after dispatch, unsupported async executors, and contradictory failed receipts.
   Evaluate whether a stored receipt digest and execution ID are checked again on
   read; the present read path checks output bytes but is not a complete durable
   record integrity audit. Verify failures after dispatch preserve unknown spend
   and cannot appear as safe not-attempted work. Decide explicit behavior for
   rejected requests whose pre-admission validation currently happens outside
   durable recording. Do not add a second core.
3. **Complete batch reconciliation.** Audit
   `tools/paid-batch-reconciler/lib/{ledger,http,request}.mjs`, CLI and package
   exports. Keep every original row and requested buyer/settlement labels,
   including preflight failures and unattempted rows. In `measureBatch`, the
   fallback row currently hardcodes `owner-qa` and can lose requested labels.
   Confirm manifests bind all semantic fields, changed bytes conflict, no partial
   success exit, and interrupted dispatch cannot replay unknown work. Determine
   durable persistence callback behavior on replay; it currently only runs on the
   initial dispatch path. Review HTTP body limits, status semantics and loopback
   binding, without introducing a live payment route.
4. **Complete value event semantics.** Audit
   `tools/buyer-value-ledger/lib/{run,ledger,cli,engine,d01,index}.mjs`.
   Test the real `measureBatch` chain before asserting it works. Reconcile repeated
   measurement after unknown-to-final or output-corruption state changes: immutable
   event IDs may collide with different observation payloads. Preserve original
   evidence and distinguish a new observation from another execution. Fix stale
   archive/status/help/public-export metadata; the CLI still imports legacy kit
   utilities, and inherited public helpers are not fully aligned with the new
   default. Preserve original receipts as historical evidence.
5. **Port meaningful inherited tests and optional PG.** Old desk `engineRunner`
   injection is no longer the new `execute` seam. Old D12 override tests and D13
   private archive/adapter paths are deliberately incompatible with the new
   default, but their safety assertions must be ported, not silently dropped.
   Current PG helpers remain inherited: batch upserts are not an atomic immutable
   batch transaction; value insertion is not duplicate-safe and nullable duration
   can render `NaN` SQL. Fix only owned PG modules if PG persistence remains in
   scope. Use the existing toolchain and dedicated port **55592**, not the helpers'
   inherited random-port defaults. No PG acceptance is claimed in this export.
6. **Prove process boundaries and separate controls.** Finish the draft scenarios
   below using actual Node processes/HTTP and simulated funding. The worker cleanup
   helper currently sends group SIGKILL without waiting for confirmed exit; audit
   PID ownership and graceful cleanup, reserving forced kills for crash tests.
   Record expected-failing substitutions separately from readiness, including a
   deliberate wrong-result/contract control that cannot be counted as useful work.
7. **Close out only after evidence.** Update the owned handoff/acceptance report,
   feature branch and draft PR. Keep status foundation until required cases pass.
   No default merge, public publication, release, real payment, credentials,
   signing or outreach. Shared engine failures remain read-only witnesses.

Draft acceptance coverage, currently **unexecuted** because of the import failure:

- Current core -> desk -> two-row batch -> value, via process and loopback HTTP.
- Actual desk and batch HTTP endpoints; persistent failed-request replay and GET.
- Kill after core execution before receipt publication, restart both processes,
  and prove no second dispatch.
- Interrupt a two-item batch; retain unknown first row and unattempted second row.
- Six concurrent same-request writers; conflicting same-order input substitutions.
- Wrong execution ID, input receipt, nested delivery, funding and output bytes.
- Stored result replacement and source-byte mutation around dispatch.
- Unknown/possible-spend/claimed-settled statements never become zero or success.
- Batch identity, duplicate IDs, corrupt admission preservation.
- Concurrent value event writers, duplicate event replay and conflicting payloads.
- Actual batch/value CLI composition without another run.

After repairing the imports and the narrow gate, the eventual focused pack is:

```sh
NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 \
  experiments/codex-window/cw62-batch-value-integration/test/acceptance.test.mjs
```

Run one suite/compiler/emulator set at a time, use ephemeral HTTP ports, and use
an assignment-owned TMPDIR. Clean only confirmed owned processes and reproducible
extracts; preserve evidence and source. This Astra closeout found zero CW62
integration-worker processes and an empty assignment closeout TMPDIR.

## Export hygiene

`git diff --cached --check` reports whitespace in the original receipts, raw TAP
failure output and three unchanged imported files. Those bytes are preserved as
source/evidence rather than rewriting historical artifacts. This is not a clean
whitespace-check claim. No full tracked RESULT was created during closeout.
