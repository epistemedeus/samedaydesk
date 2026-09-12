# CW60 foundation handoff to native Grok Heavy

Status: **foundation, incomplete, not ready**. Implementation deliberately stopped at the user's 2026-09-12 closeout instruction. No remaining work was delegated or launched. Next integration owner: **native Grok Heavy**, continuing this feature branch on an actual Cursor Cloud VM. The current machine is enrolled as **Grok VM/node_grok_bot_vm**, hostname `cursor`; hostname is not provider identity.

## Repository and exact inputs

- Repository: `epistemedeus/samedaydesk`.
- Feature branch: `codex/cw60-delivery-export-integration-20260912`.
- Native integration base actually consumed: `76f0fab6250cb8d9aaddaaaa3e4e3373ca2cc5be`.
- D06 donor: `8fad41afa47da20696f2e49032793c7a778dc695`, imported only `tools/job-delivery-outbox/`.
- D07 donor: `5620dcda5a0cd25892914717f8680c12d887632d`, imported only `tools/job-artifact-export/`.
- Original experiment receipts copied verbatim into `evidence/original/D06-RECEIPT.md` and `evidence/original/D07-RECEIPT.md`. The donor package receipts, tests, licenses, notices and isolated hash vendors are retained. Historical passing counts and old wrapper fetches in those files are **not current readiness evidence**.
- Remote `main` observed at closeout: `ad9bc7b448cf1f635ff1488affbe206aaf981ac0`. It was not fetched into, merged into, or substituted for this checkout. Shared dependency owners may have advanced elsewhere. Do not silently import their current tree or old donor runtimes.
- Exact dependency tree/blob entries and current public-kit pin: `evidence/dependency-pins.json`.

Protected dependency trees at the native base:

| Path | Git tree |
| --- | --- |
| `server/paid-useful-jobs/` | `42f7ca74d1dabb7f1b709183849578fd984c2555` |
| `tools/result-mailbox/` | `a8834fe006a6df1983d23836e394c6b0bc44e31d` |
| `tools/job-output-atomicity/` | `186ccba0b25896075d142aa10641164fb805ccce` |
| `tools/lockfile-pin-delta/` | `5f0d836b8ef516dbdb03e82ed3bb8856e7cdc53b` |
| `experiments/wave5/m01/` | `826fc6a6fbb602ae8a0ad96ca6d58d099272baf8` |

The public kit metadata is 1.4.1, SHA-256 `b365d95c8fb7695f96248433a7d440c9917b4d5085b1ce71b3982e4291e1bc3d`, 2,575,456 bytes. Donor export code mixed that metadata with its hardcoded 1.0.0 archive path and size. The current wrapper's legacy `vendor-budget-impact` probe still reported its own 1.0.0 archive (`6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`, 2,522,418 bytes). M01 jobs use the current catalog's source-identity document, a different kind of identity. These identities must not be forced equal. The cold journey uses **current in-tree `lockfile-pin-delta` through the current wrapper**, not an SDS52 worktree.

## Owned interfaces implemented, with limits

All implementation changes are confined to the two consumer packages. No wrapper, mailbox, engine, shared runtime, root package file or release artifact was edited.

- `tools/job-artifact-export/lib/current-receipt.mjs` reads current `execution.v1` receipts, delegates admission to the existing mailbox adapter, checks exact output buffers and named digest, resolves current catalog/engine identity, and calls the existing completeness verifier. It does not run an engine or introduce an execution store.
- `lib/export.mjs` hashes each buffer actually packaged, includes the receipt and execution binding in export terms, and writes through `lib/publication.mjs`. Raw exports still have a separate, unbound completeness meaning.
- `lib/import.mjs` checks ZIP bytes, per-member bytes, manifest/JSONL correspondence and recomputed terms. `importJobArtifacts({ zip, zipSha256, inspectOnly: true })` is an internal consumer interface returning the validated manifest, entries and receipt binding without publication. Normal import stages and verifies the generation before rename.
- `lib/scan.mjs`, `lib/zip.mjs`, `lib/publication.mjs` add bounded regular-file reads, link refusal, canonical ZIP paths, duplicate/local-central/type checks and staged publication. These are partial local-filesystem defenses, not a verified hostile multi-tenant sandbox or power-loss guarantee.
- `tools/job-delivery-outbox/lib/outbox.mjs`: `enqueue(store, { receipt, callbackUrl, eventId, zip, zipSha256 })` requires a verified bundle for current execution receipts. The CLI accepts `--zip` and `--zip-sha256`. Terms bind export identity and destination origin, pathname and query. Legacy receipt-only library admission remains and needs an explicit compatibility decision.
- `lib/callback-identity.mjs` checks output/terms/destination consistency. Sender validates persisted body identity before delivery and retains the existing attempt-before-network state machine.
- `bin/loopback-receiver.mjs` accepts `--bundle-dir` and `--store-dir`; the receiver is a separate process, verifies a fixed operator-provided ZIP, intends to publish and persist before acknowledging, and supports seeded response failure modes. **Its current receipt/output comparison is broken; successful commit-before-ack is not demonstrated.**
- HTTP acknowledgment checking binds schema, event ID, destination path/query, outputs digest, delivery terms hash and export identity. HTTP timeout/response caps and IPv6 hostname formatting were added but not fully accepted.
- Existing file-store initialization now uses its lock. PostgreSQL code was imported but not exercised in this integration. No second runner or mailbox store was created.

## Evidence and honest test status

All commands used Node v22.23.2 on the Grok VM. Test invocations had `NODE_OPTIONS=--max-old-space-size=768` and `--test-concurrency=1`. No installs, new model calls, PostgreSQL cluster or production HTTP service were launched. Ephemeral loopback ports were used by the journey's independent child processes.

| Repository-relative evidence under this experiment | Observation | Meaning |
| --- | --- | --- |
| `evidence/expected-failing-before.tap` | 7 tests: 1 pass, 6 fail | Baseline, not readiness. Two export cases failed during stale archive setup, and the hardlink assertion passed at that earlier gate. Only the ZIP/path cases independently reached their intended defects. |
| `evidence/boundaries-progress.tap` | 6 pass, 1 fail | Intermediate consumer repairs; receiver path case still failing. |
| `evidence/boundaries-after.tap` | 7 pass, 0 fail | Historical intermediate run. It precedes the final receiver rewrite and must be rerun on the handoff source. |
| `evidence/journey-progress.tap` | 10 tests: 2 pass, 8 fail | Last journey run against the current handoff implementation. **Not ready.** |
| `evidence/current-engine-regression.tap` | 29 pass, 0 fail | Read-only lockfile engine regression, completed before closeout. It does not validate consumer integration. |
| `evidence/closeout-syntax-check.json` | 49 `.mjs` files parse, 0 failures | Only syntax checks at closeout; exact file hashes included. No new runtime suite launched after foundation-handoff instruction. |
| `evidence/current-wrapper-probe.json` | Current wrapper legacy budget probe produced complete output | Initial compatibility observation, not the main integration journey. |

No `cold-journey.json` success receipt was produced, because the full journey failed. Existing donor tests remain saved, even where their old CLI pins or assumptions are now incompatible. Do not bulk-run them as current acceptance or let their helpers fetch old runtimes silently.

Known failures from `test/journey.test.mjs`:

1. Cold current wrapper/mailbox/export journey times out waiting for a receiver commit. Receiver variants either record zero commits or report `failed` where `unknown`/`delivered` was expected.
2. **Source-review diagnosis, not yet runtime-confirmed:** `lib/receiver.mjs` compares `bundle.binding.receipt.outputs` directly with redacted `payload.outputs`. Current wrapper `fileEntry()` rows include an absolute `path` and omit `kind`; `outputRefs()` intentionally removes file paths and adds `kind: "file"`. Both represent the same named bytes, but whole-row string comparison rejects them. Normalize through the existing named-output projection and retain exact name/kind/size/hash equality; never weaken to digest-string assertion alone. Preserve local-path redaction.
3. Partial-receipt export returns exit **1** with `internal-error`; the test requires an explicit refusal at exit **2**. `assertD01ExecutionRetrievable()` throws a mailbox error, but the export CLI only recognizes `ExportRefuse`. Add a narrow consumer-side error mapping preserving the actual refusal code; do not edit mailbox or broadly relabel programming faults.
4. Test 7 (same-origin changed path/query and stored-endpoint tamper) and test 9 (current no-change export/import) pass. The full replay/empty-200/commit guarantees are still unproven because earlier receiver admission prevents those controls reaching their intended state.

## Ordered remaining work, exclusive paths

1. **Inspect only:** compare this handoff commit's dependency trees with the intended native integration base on the new VM. Record mismatches. Do not chase remote `main`, vendor-owner changes or blanket-merge donor trees. Keep `server/`, `client/`, `tools/result-mailbox/`, `tools/job-output-atomicity/`, all engines and `experiments/wave5/m01/` read-only.
2. **`tools/job-delivery-outbox/` only:** reproduce and repair normalized receipt/output comparison at the receiver. Capture the receiver refusal body in failing test diagnostics so timeout does not hide admission failure. Audit terms/path identity and callback acknowledgment binding without weakening the redaction boundary.
3. **`tools/job-artifact-export/` only:** map current mailbox/completeness refusals into the exporter contract, preserving codes and exit semantics. Review exact engine identity and export/import compatibility for current source identities versus byte-pinned archives. Do not relabel a source document as an archive checksum.
4. **Both consumer packages plus this experiment's `test/`:** finish one whole cold journey: current wrapper CLI, existing mailbox seed/pickup, output-byte comparison, export, separate receiver reading its operator-provided bundle, commit-before-ack, sender restart/replay and receiver restart/replay. Keep separate receipts for deliberate failing controls and actual readiness. Add/finish current completed-analysis-refusal coverage as well as no-change coverage.
5. **`tools/job-artifact-export/` plus experiment tests:** exercise traversal, duplicate and hidden/local-central members, symlink/hardlink/special files, truncated archives, partial current receipts, member/JSONL/terms changes with refreshed checksum, foreign files, existing populated or linked destinations, and killed staging writers. Verify no visible partial completion. Bound aggregate export memory as well as import limits. Existing publication is a trusted same-filesystem scaffold; review parent-path races and replay of an existing generation before claiming stronger durability.
6. **`tools/job-delivery-outbox/` plus experiment tests:** reach and prove empty HTTP 200, event-only/wrong-path/wrong-digest/wrong-terms acknowledgments, lost response after receiver commit, changed same-origin path and query, two independent receiver processes, same-ID changed-body conflict, persisted endpoint tamper, receiver restart and sender crash after attempt commit. Review persisted-generation corruption on replay and file-lock ownership. If PostgreSQL acceptance is required, use only a dedicated assignment cluster at port **55590**; otherwise record it as untested. Do not launch the donor's randomly-port-bound historical Postgres tests unreviewed.
7. **Owned docs and experiment only:** update current public interfaces/usage without erasing historical receipts. Separate original donor compatibility tests from current-source acceptance. Record final source hashes, exact dependency pin, commands, counts and cleanup. Only mark ready when the actual cold journey and controls pass; engine failures belong to the engine owner and do not authorize engine edits.

## Reproduce from a new Cursor Cloud VM

All necessary source, fixtures, partial tests and evidence are tracked on this branch. Absolute `/tmp` paths in old logs are historical observations and are not prerequisites. From a normal checkout of this feature branch, run commands at repository root. Use an assignment-owned temporary directory, not a shared kit cache or another job's workspace. No old SDS52 worktree is needed.

Start with narrow failing reproductions, one at a time:

```sh
export NODE_OPTIONS=--max-old-space-size=768
export TMPDIR="$PWD/experiments/codex-window/cw60-delivery-export-integration/.runtime-tmp"
mkdir -p "$TMPDIR"
node --test --test-concurrency=1 --test-name-pattern='partial current receipt' experiments/codex-window/cw60-delivery-export-integration/test/journey.test.mjs
node --test --test-concurrency=1 --test-name-pattern='different receiver process' experiments/codex-window/cw60-delivery-export-integration/test/journey.test.mjs
```

After the named failures are repaired by the next owner, acceptance commands are:

```sh
node --test --test-concurrency=1 experiments/codex-window/cw60-delivery-export-integration/test/boundaries.test.mjs
node --test --test-concurrency=1 experiments/codex-window/cw60-delivery-export-integration/test/journey.test.mjs
```

For a successful durable journey receipt, set `CW60_EVIDENCE` to a new assignment-owned evidence directory before the latter command. Keep old TAP files intact; write new before/after logs with distinct names. Shell pipelines or trailing `rg` can mask a test command's nonzero exit, so capture the test exit separately and inspect TAP counts. The pre-closeout logs here were inspected by TAP results, not the shell's trailing-command status.

The journey currently spawns separate receiver processes but reads a bundle directory in the same test workspace; it proves neither hosted transfer nor an independent external customer. All deliveries are nonsettling; callback acknowledgment is not buyer acceptance or a sale.

## Closeout boundary

Feature commit/push and draft PR only are authorized. No default-branch merge, release, deployment, public publication, credential access, signing, real payment, outreach or nested model CLI. No further implementation or large suite was run during foundation closeout. Process audit and exact task-owned probe cleanup are recorded in `evidence/closeout-cleanup.json`. The root controller checkpoint is `CHECKPOINT.json` in the job workdir; this tracked handoff is the portable source of truth. Final closeout text is `FINAL-MESSAGE-CLOSEOUT.md`, not a new full RESULT.
