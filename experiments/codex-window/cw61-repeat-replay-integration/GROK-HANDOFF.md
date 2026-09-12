# CW61 foundation handoff to native Grok Heavy

Status: **FOUNDATION, NOT READY**. Implementation stopped at the user's September 12 closeout boundary. No completion claim, default merge, deployment, payment, signing, credential access, or provider reset is part of this export.

Next integration owner: **native Grok Heavy, CW61 repeat/replay consumer owner**, on an actual Cursor Cloud execution host. The source of this export ran on the enrolled **Grok VM/node_grok_bot_vm**, whose hostname is `cursor`; hostname is not provider provenance. No Cursor inference or nested model CLI was used for this implementation.

## Repository, inputs and immutable dependencies

- Repository: `epistemedeus/samedaydesk`.
- Existing feature branch: `codex/cw61-repeat-replay-integration-20260912`.
- Starting/current tested integration dependency tree: `76f0fab6250cb8d9aaddaaaa3e4e3373ca2cc5be`.
- Imported only `tools/repeat-job-binder/` from D09 `59c2d08b1af4c0c885275f86b76702114a79c713` (39 files) and `tools/output-replay-harness/` from D10 `d876795009a8feea4f0e579c8b716e38fab23eed` (33 files), then edited owned consumer files.
- Original assignment receipts are preserved verbatim in `evidence/original/D09-RECEIPT.md` and `evidence/original/D10-RECEIPT.md`. Imported package receipts remain historical, unchanged. Their green test claims do not describe this export.
- `evidence/import-manifest.json` records each imported Git blob and whether foundation edits changed it. New foundation modules/tests are additional scoped files.
- `evidence/dependency-pins.json` records actual shared-file Git blobs, SHA-256 hashes, archive identity and public-kit metadata.
- At closeout, remote `main` was `ad9bc7b448cf1f635ff1488affbe206aaf981ac0`. That differs from the tested tree. It was observed using `git ls-remote`, not merged, fetched into this working tree, or tested.
- Current wrapper `server/paid-useful-jobs/bin/cli.mjs` still routes these legacy jobs through useful-jobs **1.0.0**, 2,522,418 bytes, SHA-256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`. Replay's catalog mode reads public metadata **1.4.1**. Do not conflate those engines.
- D09's optional record-repeat archive remains SHA-256 `9814feabcda58c1f4a494a8919d9c6c2ac7d35b094ce5218261f976196c045ea`. Its old D01 pin labels still say `aeef964...`; current-wrapper execution instead resolves the CLI in this checkout. Those stale descriptive labels are unfinished documentation, not verified current pins.

All paths in this handoff are repository-relative unless they name a file beside this checkout. The evidence directory is `experiments/codex-window/cw61-repeat-replay-integration/evidence/`. Absolute temporary paths inside preserved receipts are historical observations. They are not required inputs on a fresh VM. The custom `fixtures/` and `.replay-inputs/` evidence bytes are committed.

## Implemented foundation and interfaces

Exclusive writable paths remain:

1. `tools/repeat-job-binder/`
2. `tools/output-replay-harness/`
3. `experiments/codex-window/cw61-repeat-replay-integration/`

Shared runtimes, engine source, archives, root manifests and unrelated work are read-only.

- `tools/output-replay-harness/lib/wrapper.mjs`: `runWrapperJob(jobId, options)` spawns the actual wrapper, uses a private temporary runtime, validates execution.v1 outer/receipt delivery, input/output byte hashes and requested output location, and cleans its own temporary runtime. `validateWrapperRun(run, options)` exposes receipt validation for contradiction controls. `WRAPPER_BIN` points at the current checkout; no old wrapper was copied.
- `lib/wrapper-replay.mjs`: `replayWrapper(request)` stages A/B input snapshots before hooks/process execution, runs two wrapper subprocesses, compares captured outputs, binds both input sets into terms, checks distinct process/execution IDs, and distinguishes analysis outcomes from delivery. This is opt-in through `replay({engine:'d01-wrapper', ...})` or CLI `--engine d01-wrapper`; `--paid-wrapper-bin` can select an explicit CLI. Catalog remains the inherited default.
- `lib/snapshot.mjs`: `inspectInputs(inputs, allowedKeys)` reads bounded file bytes and hashes; `freezeInputs(entries, destDir)` creates exclusive, read-only copies. Current-wrapper replay deliberately supports flat file jobs only; directory/job-document and example replay are refused in this foundation.
- `lib/compare.mjs`: nested `generatedAt` and arbitrary report timestamps stay semantic; only ISO top-level envelope `generatedAt` and standalone `Generated:`/`Generated at:` lines are labelled timestamp drift. Equal malformed JSON fails identity. JSON key ordering is non-semantic. Comparison retains raw byte hashes.
- Current wrapper's two reviewed legacy artifact envelopes embed temporary input paths in a digest. The foundation verifies the documented digest and actual staged input bytes, then substitutes content hashes and recomputes the comparison digest. This is consumer comparison normalization, not a second analysis engine. Other artifact schemas get no such normalization. `semanticCorrectnessVerified` is always false. Different frozen inputs break identity even when an engine collapses different changes into the same report.
- `lib/locations.mjs`: ancestor/descendant outputs now overlap; prospective path resolution handles symlinked parents. Fresh-output checks preserve existing files and refuse input/output containment.
- Binder's `--engine d01-wrapper` uses the current checkout without requiring the unrelated old archive extraction. The consumer shares the wrapper adapter above. Frozen-copy targets use exclusive creation; preexisting destinations and symlinks refuse. `partial` becomes `analysis-partial`, not `actionable`. Second-run records carry wrapper process/execution IDs, analysis, delivery and engine provenance.
- Catalog replay also freezes both input sets before execution and binds both into terms. The old live-mutation test was changed to assert frozen behavior; explicit `inputsB` is the intended changed-input control.

## Recorded tests and observed limits

All completed suites used `NODE_OPTIONS=--max-old-space-size=768` and `--test-concurrency=1`. No compiler, emulator, Postgres, install or live payment was needed. Existing local HTTP tests used their ephemeral ports. The closeout did not start another large suite.

| Evidence | Outcome | Meaning |
| --- | --- | --- |
| `original/imported-tests.tap` | 44 pass, 0 fail | Historical import baseline before consumer fixes |
| `original/consumer-regressions.tap` | 0 pass, 6 fail | Expected pre-fix controls; never a readiness result |
| `consumer-regressions.tap` | 6 pass, 0 fail | Targeted timestamp, malformed JSON, nested directory, partial status and frozen-target symlink repairs |
| `consumer-suite.tap` | 42 pass, 2 fail, 0 skipped | Current consumer suite is failing |
| `integration-suite.tap` | Six regression cases report pass; **no final summary** | Interrupted/incomplete. New current-wrapper tests have no completed result in this log |
| `current-replay.json` and `current-replay-a/`, `current-replay-b/` | Two real current-wrapper processes, distinct PIDs and execution IDs, exit 0, complete delivery; labelled-drift, identityVerified true | Same custom input replay process evidence, not semantic correctness or readiness |
| `initial-before-process.json` | exit 0, informational, complete | Known unchanged rows |
| `initial-partial-process.json` | exit 0, partial, complete | Known mismatched units |
| `initial-refused-process.json` | exit 2, transport rejected, not-run/not-attempted | Invalid numeric row refused at wrapper input validation; not a delivered analysis refusal |
| `initial-added-process.json` / `initial-added/budget-impact.json` | exit 0, actionable, added=1, yet action `no-budget-delta` | Current legacy engine semantic defect; do not repair engine here |

The two reproducible consumer-suite failures are:

- `tools/repeat-job-binder/test/frozen-refs.test.mjs`, test `CLI: changed after is analyzed from frozen-current, not the live path`: expected `actionable`, observed `analysis-partial`.
- `tools/repeat-job-binder/test/journey.test.mjs`, test `journey: repeat-job-record on samples/repeat/a, then binder with changed after`: same expected/actual mismatch.

Do not blindly change their expectations to get green. Inspect the inherited sample's units/conflicts and determine the independent expected analysis first. The repaired status mapping exposed what the archive actually returned.

Known unresolved implementation/validation work:

- `test/current-wrapper.test.mjs` was saved in full and passed `node --check` at closeout, but its semantic assertions are **unverified**. It includes current wrapper mutation, different-number, unchanged, partial, rejected, alias, nonzero, binder and receipt contradiction cases. Preserve it even if failing.
- Wrapper subprocess stdout/stderr is durably written only after successful replay of both runs. Refusal/nonzero/second-run failures do not yet preserve the same complete process evidence. A's raw captured bytes live in memory; a hook that overwrites A can destroy the only on-disk copy. Finish failure and immutable capture evidence before declaring readiness.
- Wrapper receipt provenance is compared between runs, but the validator does not yet bind a separately supplied expected engine pin for every routed job. Review that boundary and unknown/missing analysis states before relying on `identityVerified`.
- The legacy artifact normalization is intentionally narrow but needs adversarial tests for nested semantics, path binding, digest tampering, malformed outputs, output-file symlinks and unsupported artifact shapes. Treat semantic correctness as independently tested, never inferred from two parsers agreeing.
- `analysis-refused` versus wrapper-level rejection still needs a real delivered-refusal control. The saved invalid-number fixture proves input rejection only. Nonzero-after-valid-stdout is scaffolded, not recorded as passing.
- Binder currently imports utility modules from the replay package. Keep the joint source paths together on a fresh VM; decide whether to document that dependency or keep the path checks package-local without copying any runtime engine.
- README/help, FEATURE-MAP and D01 pin labels still contain historical claims. Preserve original receipts while documenting the new opt-in wrapper interface and exact tested pins.

## Ordered remaining work for the next owner

1. On an **actual Cursor Cloud VM**, check out the existing feature branch. Read this handoff and `evidence/dependency-pins.json`. Record the live integration owner's selected dependency SHA and any mismatch with `76f0fab...`. Do not race the vendor owner or merge new engine source into these consumers.
2. Within the three exclusive paths above, finish durable process and immutable output capture evidence for A, B and all failure exits. Keep originals and fresh independent output locations. Retain two input snapshots and bind terms to the consumed bytes.
3. Finish wrapper-result validation (expected engine pin, analysis state, complete nested delivery, digest/path binding) and review current-wrapper/legacy normalization boundaries. Keep runtime and engine files read-only.
4. Diagnose the two failing inherited binder tests from actual input bytes and domain expectations. Create separate known changed/no-change/partial/refused controls. Add a distinct expected-failing legacy engine test for added-row `no-budget-delta` and omitted numeric delta; never count that expected failure as readiness.
5. Run the targeted current-wrapper scaffold one case at a time, then its file once corrected. Add real API used-operation controls for the second supported family. Verify input mutation between inspection/execution, explicit changed B input, same/dot/symlink/symlink-parent/nested paths, nonzero after valid stdout, semantic timestamp changes, partial/incomplete delivery and receipt contradictions.
6. Update consumer docs/contracts and pin reporting, preserve historical receipts, then run the scoped consumer suite once with concurrency 1 and heap 768 MiB. Run only appropriate shared runtime checks without edits and record their independent result. No Postgres unless an actual test requires it; if required use dedicated 55591. HTTP ports must be ephemeral. Clean only this assignment's processes/extracts.
7. Write the final readiness record only after completed meaningful controls and review. Push this feature branch/draft PR only. No default merge, release, publication, real pay, credentials, signing or outreach.

## Acceptance commands for the next owner (not run at closeout)

From repository root, create an assignment-owned temporary directory outside tracked source; keep its path local to the command environment. Commands below do not require any old VM path.

```bash
export NODE_OPTIONS=--max-old-space-size=768
node --test --test-concurrency=1 \
  --test-name-pattern='CLI: changed after is analyzed from frozen-current' \
  tools/repeat-job-binder/test/frozen-refs.test.mjs
node --test --test-concurrency=1 \
  --test-name-pattern='journey: repeat-job-record' \
  tools/repeat-job-binder/test/journey.test.mjs
node --test --test-concurrency=1 \
  experiments/codex-window/cw61-repeat-replay-integration/test/consumer-regressions.test.mjs
node --test --test-concurrency=1 \
  experiments/codex-window/cw61-repeat-replay-integration/test/current-wrapper.test.mjs
# After the targeted cases are understood and repaired:
node --test --test-concurrency=1 \
  tools/repeat-job-binder/test/*.test.mjs \
  tools/output-replay-harness/test/*.test.mjs
```

Use new, empty output directories for fresh CLI controls. The recorded `evidence/current-replay-*` directories are immutable evidence and should correctly refuse reuse. To replay custom inputs, use `tools/output-replay-harness/bin/replay.mjs --engine d01-wrapper --job vendor-budget-impact`, `--before` pointing to `fixtures/before.json`, `--after` to `fixtures/changed.json`, and separate new `--out-a`/`--out-b`. Explicit `--after-b` selects independently frozen changed input.

## Closeout cleanup and portability

`evidence/closeout-cleanup.json` records removal of exactly two completed reproducible extraction directories (1,426 extracted files), while retaining custom fixtures, staged input copies, raw outputs, receipts and process logs. No engine/runtime source is imported through those extracts. At closeout there were no matching scoped test processes; other Node processes were left alone. The assignment's `.closeout-tmp` was empty. Do not require a restored extraction cache on the new VM: existing committed archives and the Node/tar toolchain reconstruct it.
