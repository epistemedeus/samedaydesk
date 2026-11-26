# N5-R05 receipt

The saved capture supports two different decisions. D1 is a decide-or-reuse hit. D2 is direct sharing of the same capture. decide-or-reuse refuses D2, and that refusal is the within-CLI no-fit.

## Bases

- Declared writer base: `09b2d6155ce247d828355183c9367889daf5f0f0`, tree `0619ee40acd45537fe1fde8723d07152ef09508a`.
- Actual writer base at this run: `09b2d6155ce247d828355183c9367889daf5f0f0`, tree `0619ee40acd45537fe1fde8723d07152ef09508a`. The actual writer HEAD matches the declared base.
- Writer tools/result-reuse tree: `4ad9557b5845ac03292326aadd95738d460878f5`. Every CLI path in this run is under the source root.
- Writer tools/recurring-job-recipes tree: `61f78f632b6697171224b395b127fbbaa618ef78`. Writer capture blob `5796a1ffbe9075b249a0600666c4d0aa36f56a26`, prior blob `c2a324e82bef0b6409814515c88c6dcb77df1cff`. Same fixture blobs, read only through the source root.
- Input source: `9f6c0c4e396dd7677f334400eed93e3445fad600`, tree `8a85072962a71dc1b78b19a0dc0caf17aebac833`.
- Input tools/result-reuse tree: `651930a2dbf880c25f475b160229959002de2d99`, equal to `da769f7870e494bb583e31766a477a2ff974fc10`.
- Input tools/recurring-job-recipes tree: `61f78f632b6697171224b395b127fbbaa618ef78`.
- Writer history at this run is the declared base. The input commit is the detached source root.
- Source root for this run: `/tmp/samedaydesk-src-9f6c0c4e`.
- Node: v22.23.4. Run started: 2026-11-05T03:39:50.803Z.

## Blobs

- example-unchanged.json git blob `5796a1ffbe9075b249a0600666c4d0aa36f56a26`, raw sha256 `9886f2edce7ee38cc8c7a67cba47edb621f0ca2497ca2aa1e5fbde34c37d0dea`.
- source-change.prior.json git blob `c2a324e82bef0b6409814515c88c6dcb77df1cff`, raw sha256 `6c35116e799baefdf1c82a5379076251401dbb518f398f95865c92f959634761`.
- example-changed.json git blob `582448cf4e962af87df1fec24023481ebb78cec4`.
- result-reuse cli.mjs `a8937ecb777cf017eeb5c327c06e553a3d0ffdf5`, src/export.mjs `939fa19abab4cf4432f8c8bc214cbb2676aca5f7`, src/project.mjs `bff16db7f645d27926836ccc2bb8deb4158a41c4`, src/map.mjs `8dd669b8d94142b17369567126e88a354d0c47ab`.
- recipes cli.mjs `da16132355557e03856b38540a393f2ea628bcc4`, verification-reconcile.mjs `17ac8962c22667dff399bc16f5e71a9af19e3613`, source-change-alert.mjs `2feeff14e3fa3ddb4c3a40f3dfc3d61ada5bf5f2`.
- D1 before-work digest: `sha256:ee025b1a337e17afda633aa4ec4ed66ec69e27113993386bb82184cd2e3aad6c`.

## Normal consumer output

D1 source-change-alert. Consumer: owner and synthetic. Task source-change-example, subject source-change-example-decision, fields title, clock 2026-09-09T08:00:00.000Z, horizon 168.

- One producer run, then a hit with the producer absent. Producer outcome `unchanged`, recovery `keep_prior`, payment.attempted `false`.
- Bind action `bound`, producerInvoked `false`.
- Reuse verdict `reuse`, outcome `unchanged`, recovery `keep_prior`, producerInvoked `false`.
- Statement: source-change-alert unchanged; recovery keep_prior.
- Operator next: No content change against the immutable prior. Keep the prior; schedule the next operator-supplied run.
- recomputeCostAvoidedNetOfUpkeep: `costs_unknown`. inputCaptureNs: 120238.

D2 verification-reconcile. Consumer: synthetic. Same capture file and same prior file, unedited recipe, direct sharing. No opt-in flag exists on this command.

- Outcome `unchanged`, recovery `keep_prior`, mismatches `[]`.
- noChangeProven `true`, automaticPaymentReplay `false`, payment.attempted `false`.
- Operator next: No content change against the immutable prior. Keep the prior; schedule the next operator-supplied run.

Within-CLI no-fit for D2:

- decide-or-reuse bind of a verification-reconcile manifest exited 1. Message: input is not the before-work public manifest for source-change-alert. No observation file was written.
- The reuse form on that manifest exited 0 with verdict `recompute` reason `input_not_before_work`. It did not return a D2 decision.
- preview and export of the D2 result exited 1 and 1. Message: unrecognized result; supply extract-batch, page-change brief, record report, or n45 page-change result JSON. Export did not store an unbound legacy observation, so a later unbound_legacy recompute was not reached.
- preview and export of the capture file itself exited 1 and 1. The capture is shared as the fixture file.

## One result does not answer the other

ContentHash-only variant, title left at Example Domain. Both commands read derived/capture-hash-only.json.

- D1 recompute: outcome `unchanged`, recovery `keep_prior`. Title is the watched field, so the field alert does not fire.
- D1 saved reuse against that manifest: verdict `recompute`, reason `digest_mismatch`. The frozen hit is not served.
- D2: outcome `changed`, mismatches ["contentHash"]. The later observation is not the same delivered content.

Field-changed committed fixture example-changed.json:

- D1 reuse reason `digest_mismatch`. D1 recompute outcome `changed`, recovery `review_and_sequence`.
- D2 outcome `changed`, mismatches ["contentHash","title"].

## Failure cases

- Missing capture, bind exit 1: before-work manifest is missing the current capture.
- Missing capture, reuse exit 0: verdict `recompute`, reason `input_not_before_work`. The bind path keeps the specific sentence. The reuse path collapses it to input_not_before_work.
- D2 with no --candidate exit 1, code `missing_candidate`.
- D2 nonexistent candidate exit 1, code `invalid_candidate`.
- Partial capture: D1 reuse reason `digest_mismatch`. D2 outcome `partial`, recovery `keep_partial_rows`.
- Freshness clock 2026-09-16T08:00:01.000Z, horizon 168: D1 reason `stale_clock`. D2 outcome `stale_baseline`, recovery `refresh_baseline`.
- Withdrawal: D1 reason `opt_in_withdrawn`. D2 --withdraw-opt-in exit 1. The direct recipe has no opt-in gate. The frozen D2 command succeeded without one. Recorded, not fixed.
- Wrong source root and missing source root: both refused with exit 2, empty stdout, and an empty output directory. No CLI was started.

## Commands and exits

Executables are the source-root tools/result-reuse/cli.mjs and tools/recurring-job-recipes/cli.mjs. Full argv, stdout, and stderr are under evidence/.

| Id | Exit | Wall ms | Result |
| --- | --- | --- | --- |
| d1-produce-frozen | 0 | 41.482 | unchanged |
| d1-bind-frozen | 0 | 34.651 | unchanged |
| producer-stub-probe | 1 | 25.250 |  |
| d1-reuse-frozen | 0 | 36.845 | reuse |
| d2-direct-frozen | 0 | 41.814 | unchanged |
| d2-bind-refusal | 1 | 36.801 | input is not the before-work public manifest for source-change-alert |
| d2-bind-own-result | 1 | 32.731 | input is not the before-work public manifest for source-change-alert |
| d2-reuse-against-d1 | 0 | 32.707 | recompute |
| d2-preview | 1 | 31.845 | unrecognized result; supply extract-batch, page-change brief, record report, or n45 page-change result JSON |
| d2-export | 1 | 32.953 | unrecognized result; supply extract-batch, page-change brief, record report, or n45 page-change result JSON |
| capture-preview | 1 | 31.025 | unrecognized result; supply extract-batch, page-change brief, record report, or n45 page-change result JSON |
| capture-export | 1 | 31.047 | unrecognized result; supply extract-batch, page-change brief, record report, or n45 page-change result JSON |
| d1-reuse-changed | 0 | 35.758 | recompute |
| d1-recompute-changed | 0 | 37.692 | changed |
| d2-changed | 0 | 38.533 | changed |
| d1-reuse-hash-only | 0 | 35.524 | recompute |
| d1-recompute-hash-only | 0 | 36.102 | unchanged |
| d2-hash-only | 0 | 40.722 | changed |
| d1-bind-missing-capture | 1 | 32.259 | before-work manifest is missing the current capture |
| d1-reuse-missing-capture | 0 | 31.065 | recompute |
| d2-missing-candidate | 1 | 38.525 | error |
| d2-invalid-candidate | 1 | 38.959 | error |
| d1-reuse-partial | 0 | 39.758 | recompute |
| d2-partial | 0 | 38.064 | partial |
| d1-reuse-stale | 0 | 31.981 | recompute |
| d2-stale | 0 | 39.798 | stale_baseline |
| d1-withdraw | 0 | 32.049 | recompute |
| d2-withdraw-flag | 1 | 36.389 |  |
| negative-missing | 2 | 29.615 | source_root_refused, out dir empty |
| negative-writer | 2 | 89.412 | source_root_refused, out dir empty |

## Adaptation and review versus direct sharing

Direct sharing is the competent baseline. It is the two recipe commands on the same capture and the same prior. No second fetch was made.

| Step | Wall ms | What it answers |
| --- | --- | --- |
| D1 direct producer | 41.482 | unchanged, keep_prior |
| D1 bind | 34.651 | stores that decision |
| D1 reuse hit, producer absent | 36.845 | same decision, plus digest, opt-in, freshness, and private-field gates |
| D2 direct | 41.814 | same delivered content, no payment replay |
| D2 decide-or-reuse bind | 36.801 | refuses |
| D2 export | 32.953 | refuses |

Measured producer wall time is 41.482 ms. Measured reuse-hit wall time is 36.845 ms. The hit also reports inputCaptureNs 120238. Net savings are not claimed. The CLI sets recomputeCostAvoidedNetOfUpkeep to costs_unknown, and operator compute is not priced.

Adaptation: D1 uses the existing decide-or-reuse flags. D2 was not adapted into that CLI. The bind refusal is the whole adaptation result, and the useful D2 answer is the same direct command sharing already uses. Consumer diff is none. project.mjs and map.mjs stay internal to those CLIs. Bind is the path that writes the mapped observation. Preview and export are the path that enters project, and both refuse this capture and the D2 result.

Review: 63 checks, 0 failed. Source worktree status after the run is clean. No tools/result-reuse or tools/recurring-job-recipes file was edited.

## Falsifier

- Frozen D1 reuse and frozen D2 direct answer: pass.
- ContentHash-only divergence: pass.
- No second frozen producer, no live fetch, no consumer edit: pass. Variant recomputes use example-changed.json and the derived hash-only file, not a second run on the frozen capture.
- Refusals stay recompute, refusal, or error: pass.

## Next external-use question

Who besides the owner would hold a second need against the same capture? That is R07's scale question, and it stays a hold.

## Limits

- Payment was not attempted. The prior records payment.attempted false, and both frozen outputs report payment.attempted false.
- No live fetch, paid monitor, cron, or scheduled request. --schedule daily is only the recipe's stored hint.
- No public-safe certification and no merchant acceptance. The capture has no license field. Permission is the caller opt-in, the public example.com fixture, and private-field rejection.
- No savings claim. Costs stay costs_unknown.
- No edit to result-reuse, the recipes, or any core. The release branch codex/h136010-machine-release-20261103 was not pushed, merged, or used as a PR base.
- experiments/n5-remainder was not used.
- D2's missing opt-in withdrawal gate is a finding of the direct route, not a fix.
- Consumers stay labeled owner and synthetic. There is no second real consumer.

