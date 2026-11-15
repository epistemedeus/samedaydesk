# H154510 AGL coherent receiving

Writer: `epistemedeus/samedaydesk` branch `codex/n6-b4-cold-client-participation-20261105`, admitted head `c1d7fae74a4e10016c36d41b16f2d36ddc0737ca`, draft PR 367. Worktree `/home/ubuntu/ae14-work/h154510`. Node v22.23.4. Measured 2026-11-05. Admission checkpoints `2026-11-05T23:35:00Z` and `2026-11-05T23:50:00Z` stay frozen against the foreground that started this run.

Read-only companions, detached worktrees, refs not moved:

- PR364 `3a4a7538329292c11d94b148d58964fc0656dece` shared capture D1/D2. PR366 is stacked on this head.
- PR365 `9d1f3f9677ade404131fc62ee3e3ab99b10ec144` residual useful need. Worktree `/tmp/h154510-wt/pr365`.
- PR366 `95c8a84155d01d67c707170e94aa148ba6542c50` portable CC0 decision. Worktree `/tmp/h154510-wt/pr366`.
- Merchant input `epistemedeus/x402-url-extractor` `f9dd59aeeb200881bc1313ed846ba002e7081258`. Package name `x402-merchant` 1.23.45. Sibling checkout of both worktrees. Role is the pin in `tools/recurring-job-recipes/vendor/merchant-contracts.mjs`. The resolver accepts that sibling when `page-change-http.mjs`, `examples/customer-x402/package.json`, and package name `x402-merchant` are present. `npm ci --no-audit --no-fund --ignore-scripts` of that checkout's own lockfile added 241 packages. No registry install of the merchant package. No samedaydesk root `npm ci`. No vendor `npm ci`.

Root `package.json` name `samedaydesk` has no `test` script. A root `npm test` is not this suite.

Each composition row is one `node <cli.mjs>` process. Direct rows use `tools/recurring-job-recipes/cli.mjs` on the PR366 tree. Bind, reuse, export, import, and retire use `tools/result-reuse/cli.mjs` on the PR366 tree. Residual uses `tools/result-reuse/cli.mjs` on the PR365 tree. The recipe CLI bytes match between those two heads. No model child was started.

## Writer changes

`examples/cold-requester-0.3.1.mjs` bytes stay `ad133fb820d794fb49eff6767153cd3f42202d4259e434214d9a9a4798f5fa0e`. Pinned `client/cold-requester-0.3.0.mjs` stays `38d4e05cc757223f20e727fc75cf5a8bfe6d4e6dcaadd6cecdaff248422529d4`. Installed market client `clients/cold-requester-0.3.1.mjs` stays 30187 bytes, `accb4b22a02a0752028d883b8e501b11c677f6f0ee342a8ffcc9d1874cd5d7b9`, recorded by `server/scripts/fixtures/h142010-cold-requester-0.3.1.mjs` and `docs/machine-promotion/evidence/private-successor-descriptor.json`.

`examples/GUIDE.md` now pins `ad133fb8...` for the file to run. The introduction digest `dc7d040ecafb99009a0df5ef1130c6b2d805a6d317e78634f17adc565034805d` (commit `3bbbfa9d`) remains labeled as the digest that does not match the file to run. `acquire` and `signup` on this examples file stay unqualified. Omitting a descriptor returns `acquisition_required`. Supplying the installed descriptor returns `acquisition_client_mismatch`. Neither path is acquisition success. No replacement descriptor and no new market identity were published.

Focused client command, from `vendor/hosted-wallet-market`:

```sh
node --test --test-concurrency=1 --test-timeout=120000 test/cold-client-participation.test.mjs
```

Exit 0. Tests 18, pass 18, fail 0, skipped 0, duration_ms 2236.99. The stub is in-process. No socket and no Postgres. New checks: guide pin and installed identity, acquire without a descriptor (`acquisition_required`, zero HTTP), installed descriptor mismatch (`acquisition_client_mismatch`, zero HTTP), signup without a descriptor (no account file, zero HTTP), and `fund` on the unfunded rail (`ok` false, `paidWork` false, `code` `not_found`, one POST `/v1/market/fund` with `proofId` `unfunded`). Post, permit-accepted-work, and accepted-work still run from a 0.3.0 account file.

`test/historical-authority.test.mjs` still requires absolute `H103010_OPERATOR_ENTRY` at module load. That fixture is absent on this host. The test was not rerun and was not weakened. Prior PG16 receiving on f965/231ad294 stays the authority for PR365 VM 1/1, delegation 5/5, and PR367 96/97 with that one input held. This host has no `psql`. Those PostgreSQL runs were not repeated.

## PR366 declared commands

Cwd `/tmp/h154510-wt/pr366`, exact head `95c8a84155d01d67c707170e94aa148ba6542c50`. Merchant sibling present. `MERCHANT_INPUT_ROOT` unset.

```sh
npm run test:result-reuse
```

Script body: `node --test` of export, decision-reuse, source-gate, shared-capture-two-decisions, portable-decision, and `experiments/agl-r06-portable-decision-20261105/test/harness.test.mjs`. Exit 0. Tests 51, pass 51, fail 0, skipped 0, duration_ms 2435.321159.

```sh
npm run test:recurring-job-recipes
```

Exit 0. Tests 97, pass 97, fail 0, skipped 0, duration_ms 929.862341.

```sh
node experiments/agl-r06-portable-decision-20261105/harness.mjs
```

Stdout: `{"hitRate":0.625,"falseReuseCount":0,"recomputeCount":3,"retirements":1}`. Exit 0. The R06 README states the case mix is 8 synthetic cases, 2 where the second consumer's capture differs, and 1 retired manifest. That hit rate is the designed mix. It is not a real-world rate and it is not a saving. The harness rewrote `experiments/agl-r06-portable-decision-20261105/RESULT.json` on the disposable worktree. That dirty file was not copied onto this writer.

## Comparison

Competent direct baseline is the shipped recipe fixtures, recipe `source-change-alert` (the only recipe id all three CLIs share) plus `verification-reconcile` and `comparable-record-extraction`. Clocks: produced `2026-09-09T15:00:00.000Z`, next eligible `2026-09-10T15:00:00.000Z`, stale `2026-09-20T15:00:00.000Z`, horizon 168 hours. Task `agl-h154510-source-change`, subject `example-domain-title`, sequence 1, `--opt-in`. Unchanged source-change input digest `sha256:ee025b1a337e17afda633aa4ec4ed66ec69e27113993386bb82184cd2e3aad6c`. Bound observation `obs_5975f55a136e9bf9e6fe1bdca8222395`, revision `rev_1`, schema `neomorphic.task-memory.observation.v1`. The useful answer lives at `payload.usefulDecision`.

Milliseconds are one wall-clock sample of the node process, including startup. They are separate from requester review and producer upkeep, which were not measured. Every direct recipe result has `cost.primary.kind` `costs_unknown`. Reuse reports `liveMetric.recomputeCostAvoidedNetOfUpkeep` `costs_unknown`, `observedAcceptedTaskLedger` false, and `publicSafeCertified` false. `cannotEstablish` includes a distinct later accepted task, recompute cost avoided net of upkeep, public-safe certification, and a merchant or payment outcome. A listed 0.01 USDC `POST /extract/batch` price was not invoked. Economics for this comparison are `costs_unknown`.

Direct recipe CLI:

| id | exit | ms | outcome | payment |
| --- | --- | --- | --- | --- |
| source-unchanged | 0 | 44.730 | unchanged | attempted false, replayBlocked true |
| source-changed | 0 | 39.516 | changed | attempted false, replayBlocked true |
| source-stale-prior | 0 | 39.737 | stale_baseline, ok false | attempted false, replayBlocked true |
| source-paid-prior | 0 | 39.728 | unchanged | ok true, attempted false, replayBlocked true, hasPriorReceipt true |
| verify-unchanged | 0 | 36.810 | unchanged | attempted false, replayBlocked true |
| verify-changed | 0 | 39.331 | changed | attempted false, replayBlocked true |
| verify-payment-replay | 1 | 38.344 | error | code payment_replay_blocked, attempted false, replayBlocked true, recovery bounded_retry_then_stop |
| record-extract | 0 | 38.909 | partial | attempted false, replayBlocked true |

Shared capture on the PR366 CLI (`decide-or-reuse`):

| step | exit | ms | verdict | reason | producerInvoked |
| --- | --- | --- | --- | --- | --- |
| bind unchanged | 0 | 34.521 | action bound | | false |
| next eligible, same task/subject/sequence | 0 | 37.292 | reuse | | false |
| changed capture | 0 | 32.254 | recompute | digest_mismatch | false |
| stale clock | 0 | 30.888 | recompute | stale_clock | false |
| other task and subject | 0 | 33.941 | recompute | subject_mismatch | false |
| source decision on a verify manifest | 0 | 32.814 | recompute | recipe_changed | false |
| bind verify, then next eligible | 0 | 35.669 / 35.767 | bound, then reuse | | false |

`outputMatchOnEligibleReuse` is true: the next-eligible `decision.useful` JSON equals the bound useful decision (`outcome` unchanged, evidence `sha256:fixture-example-domain-v1`, title `Example Domain`).

Authoritative body tamper, re-run against `payload.usefulDecision` on the bound observation (the earlier statement-only edit did not touch that object):

- Set `payload.usefulDecision.outcome` to `changed`. Exit 0, 42.304 ms, verdict `reuse`, reason null, producerInvoked false, served outcome `changed`, served hash `sha256:fixture-example-domain-v1`.
- Set `payload.usefulDecision.evidence.contentHash` to `sha256:tampered`. Exit 0, 36.346 ms, verdict `reuse`, reason null, served outcome `unchanged`, served hash `sha256:tampered`.

`decide-or-reuse` binds the before-work input digest and serves the stored useful body on a digest match. A mutated useful body is served as reuse.

Portable on the same CLI:

| step | exit | ms | verdict | reason |
| --- | --- | --- | --- | --- |
| export | 0 | 32.035 | | |
| import, same capture, other task | 0 | 33.440 | reuse | |
| import, changed capture | 0 | 34.353 | recompute | capture_digest_mismatch |
| import, flipped portable outcome | 0 | 31.126 | recompute | integrity_mismatch |
| retire, then import | 0 | 32.472 / 31.314 | recompute | retired |
| export with staleAfter `2026-09-09T16:00:00.000Z`, import at the stale clock | 0 | 32.254 / 31.924 | recompute | stale |

The imported useful decision on the matching capture matches the bound useful decision. Portable drops the original task id and refuses body tamper. Task-bound reuse does not.

Residual on the PR365 CLI, unfunded, no live post. Answered field `title`: exit 0, 32.358 ms, route `direct`, verdict `reuse`, sent false, paidWork false, paymentAuthority `none`, debtCreated false, funding `voluntary`, producerInvoked false. Absent field `description`: exit 0, 35.522 ms in the composition run and 38.132 ms on the confirmation run, route `residual_need`, verdict `reuse`, sent false, paidWork false, debtCreated false, obligationId null. The unsent post shape has criterion `remainder:description`, payableKinds `usable`, and `coldRequesterPost` argv beginning `post --criterion remainder:description`. Changed capture: route `recompute`, reason `digest_mismatch`. Verification-reconcile manifest and its bound decision on this CLI: route `recompute`, reason `input_not_before_work`, message `input is not the before-work public manifest for source-change-alert`. `direct_rerun` was not produced. The shipped source-change capture answers `title` only.

Bind of the wider `comparable-record-extraction` output: exit 1, 32.079 ms, message `input is not a before-work public manifest for a supported recipe: source-change-alert, verification-reconcile`. Direct remains the path for that job.

## Conclusion

Direct execution is the path for a new input, a changed or stale capture, a payment-replay candidate, a wider record-extraction job, and any caller who needs a field the saved capture does not answer. Wall time for the next eligible reuse (37.292 ms) is the same order as the direct offline compare (44.730 ms). That gap does not establish avoided cost.

Retained `decide-or-reuse` preserves the useful answer for the same task, subject, and sequence inside the horizon and leaves `producerInvoked` false. It also serves a mutated `payload.usefulDecision` as reuse. Use it only when the stored body is still the publisher's bytes.

Portable import is the saved asset that helps a distinct consumer who already holds the same before-work capture. It preserves the useful decision without the original task id and refuses capture drift, body tamper (`integrity_mismatch`), retirement, and staleness. It still requires a prior bound decision. Review and upkeep stay unmeasured. `costs_unknown`.

Residual classifies an unanswered field into an unsent voluntary post shape. A miss stays `recompute` with the caller. It does not replace the producer and it was not posted, funded, or priced.

The harness hit rate 0.625 is the designed 8-case mix. It is not demand and it is not a saving.

## Dispositions for Root

These companions need a source change on their own writers. This run did not take those branches.

1. Examples 0.3.1 `acquire` and `signup` stay unqualified. The installed descriptor hashes `accb4b22...`, 30187 bytes. This examples file hashes `ad133fb8...`. No second market identity was published.
2. `H103010_OPERATOR_ENTRY` is absent. `historical-authority` stays input-held. Prior PG16 result stands at PR367 96/97 with that one failure.
3. PR365 residual accepts only `source-change-alert`. A `verification-reconcile` before-work manifest returns `input_not_before_work`. D2 and portable live on PR366.
4. PR366 `decide-or-reuse` serves a mutated `payload.usefulDecision` as `reuse`. `import-decision` refuses that class of body change with `integrity_mismatch`.
5. `comparable-record-extraction` is not a bindable before-work recipe on the PR366 CLI.

## File inventory

Changed on this writer:

- `vendor/hosted-wallet-market/examples/GUIDE.md` pins the current examples digest and records acquire/signup as unqualified.
- `vendor/hosted-wallet-market/test/cold-client-participation.test.mjs` adds the five checks named above.
- `experiments/agl-coherent-receiving-20261105/RESULT.md` this report.
- `experiments/agl-coherent-receiving-20261105/receipt.json` the measured command and comparison receipt.

Unchanged product files that this outcome depends on: `vendor/hosted-wallet-market/examples/cold-requester-0.3.1.mjs`, `vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs`, `server/scripts/fixtures/h142010-cold-requester-0.3.1.mjs`, `docs/machine-promotion/evidence/private-successor-descriptor.json`, tracked `AE25-EXPORT.md` (historical pilot export for another worktree; left as stored).

Not part of this commit: `/tmp/h154510-wt/**`, the merchant checkout, and the harness-rewritten `RESULT.json` on the disposable PR366 worktree.

## RESULT

PR367 examples acquire/signup are explicitly unqualified, with the current file digest in the guide and 18/18 focused client tests passing, including the unpaid fund rail. PR366's declared result-reuse (51/51), recipes (97/97), and harness commands passed from the exact head. Direct execution remains preferable for new, drifted, stale, payment-replay, and wider-record inputs. Portable import is the reuse path that preserves output for another task id and refuses tamper. Task-bound reuse preserves output only for the same identity and serves a mutated useful body. Residual emits an unsent unfunded post shape for a missing field. `costs_unknown`. No payment, account, deploy, or default-branch change.

## NEXT

The next useful external consumer is a later caller who already holds the same source-change or verification before-work capture and needs that saved answer under a different task id. That caller imports the portable decision and recomputes on `capture_digest_mismatch`, `integrity_mismatch`, `retired`, or `stale`. A caller who wants a field the capture does not contain, such as `description` on the shipped title-only source-change capture, receives only the unsent `residual_need` shape (`remainder:description`, funding voluntary, sent false). This run did not post it. Root owns integration of the PR365 recipe limit and the `decide-or-reuse` body-integrity gap.
