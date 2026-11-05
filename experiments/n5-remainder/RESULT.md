# N5-REMAINDER receipt

consumer: synthetic-normal

Run 1 below is the original default-main refusal and stays recorded. Run 2 is the pinned source-root execution and does not replace run 1.

## Verdict

Stopped at the import gate. The fetched default branch does not contain the task acceptance module, the rights check, or the fee function. No remainder fixture was run. No delegation object was emitted. No obligation was written. No core was created, and no pin tree was copied into this branch.

The exact missing paths on start commit `09b2d6155ce247d828355183c9367889daf5f0f0` are:

| Role | Path | Export |
| --- | --- | --- |
| Task acceptance | `vendor/hosted-wallet-market/src/voluntary-market.mjs` | `voluntaryMarket` (`reviewVoluntary`) |
| Rights check | `vendor/hosted-wallet-market/src/voluntary-market.mjs` | rights predicate inside `offerVoluntary` (`voluntary_rights_required`) |
| Rights publication fence | `vendor/hosted-wallet-market/src/accepted-work-publication.mjs` | `proposalFrom` |
| Fee function | `vendor/hosted-wallet-market/src/fee.mjs` | `quoteEconomics`, `feePerCapture` |

The pinned capture CLI does import from its own commit. This branch's `tools/result-reuse/src/export.mjs` does not export `decideOrReuse`.

## Pins

Default branch, fetched at start from `origin/main`:

- commit `09b2d6155ce247d828355183c9367889daf5f0f0`
- tree `0619ee40acd45537fe1fde8723d07152ef09508a`
- parents `a5b40cb015d30de8bf8f3cbbeda1360151279fb0` `63e4076d1ffd98bc2f561fbb4c66d2fedb714830`
- subject: Merge pull request #344 from epistemedeus/codex/root64331-receive-time-freshness-20261029
- committer date: 2026-10-29T14:18:09-07:00

Capture CLI, RECUR:

- commit `da769f7870e494bb583e31766a477a2ff974fc10`
- tree `e34d2a883546e5c8b1b167d831ca0c7d6526b9b6`
- parent `369dfbf5c27de5e72db7554550b219c7b1b1629c`
- subject: Key decide-or-reuse to the before-work public input.
- committer date: 2026-11-04T20:30:08+00:00
- branch tip observed: `codex/agl-recur-amend-20261104`
- `tools/result-reuse/src/export.mjs` blob `939fa19abab4cf4432f8c8bc214cbb2676aca5f7`
- `tools/result-reuse/src/project.mjs` blob `bff16db7f645d27926836ccc2bb8deb4158a41c4`
- `tools/result-reuse/src/map.mjs` blob `8dd669b8d94142b17369567126e88a354d0c47ab`
- `tools/result-reuse/cli.mjs` blob `a8937ecb777cf017eeb5c327c06e553a3d0ffdf5`

Same paths on the start commit:

- `tools/result-reuse/src/export.mjs` blob `ae31de599119b971f3bd68100024ce60c060ba96`
- `tools/result-reuse/src/project.mjs` blob `da590948f43daa695d64de2e1fc5e7da27a69061`
- `tools/result-reuse/src/map.mjs` blob `8dd669b8d94142b17369567126e88a354d0c47ab` (same blob as the pin)
- `tools/result-reuse/cli.mjs` blob `5c6d82f3d09374bc92007f638bf728086fcf871c`

CONTRIB, cases left unrun:

- commit `633a1ced99bb72e798c4b2195261ec1646d21f82`
- tree `f9df130a5c1ceda2ca7b861a58f4e6ff54f9d383`
- parent `3ba5869dcdf2fc58a1d6d09093144075d5d4a231`
- subject: Name the applied row in the handback decision.
- committer date: 2026-11-04T20:01:46+00:00
- branch tip observed: `codex/agl-contrib-amend-20261104`

H17800:

- prefix given: `afe6cbd6`
- `git cat-file` and the samedaydesk commits API found no such object
- `csv.json` and `installer.json` were not rerun
- the prefix was not copied in

Installed runtime, read only, not deployed, release branch not checked out:

- commit `0593026ad155352f263e4749dc889a1578d91675`
- tree `c45303df5350ce899467c840cd0803a1613959a3`
- parents `e32c3f2ce4391ccba9e7d15a3fda0a65459406fd` `f8212a6bd7ff40c637464e2c22435fcb4ca3ba90`
- subject: Merge pull request #354 from epistemedeus/codex/root53581-measurement-ci-20261104
- committer date: 2026-11-03T21:04:27-08:00
- contained by `remotes/origin/codex/h136010-machine-release-20261103`

Source integration, recorded and not deployed, release branch not checked out:

- commit `9f6c0c4e396dd7677f334400eed93e3445fad600`
- tree `8a85072962a71dc1b78b19a0dc0caf17aebac833`
- parents `81e1624b6a4481674418a1dc7a173614dc341090` `a820b34577dd053709effd529b92fca84b8ada25`
- subject: Merge pull request #359 from epistemedeus/codex/agl-seed-loop-20261104
- committer date: 2026-11-04T17:48:45-08:00
- contained by `codex/h136010-machine-release-20261103`
- compare of start commit to this commit: diverged, ahead 268, behind 9

Fee, acceptance, and publication blobs on the capture pin (absent from the start commit):

- `vendor/hosted-wallet-market/src/fee.mjs` blob `a20638869f7456b7be8e4237c6b57b691e85c98e`
- `vendor/hosted-wallet-market/src/voluntary-market.mjs` blob `e275901c9f436308ee697d7442fd3bccf6332793`
- `vendor/hosted-wallet-market/src/accepted-work-publication.mjs` blob `b5d8de857f7773edac86221337ad0f144eddb76d`

Governing plan read from the attached file. Its git blob is `6e3131ffbb5b89b4a9936c56d0f2de898b540f92`.

MCP Tasks pull 2782, already qualified, not rebuilt:

- repository `modelcontextprotocol/typescript-sdk`
- pull 2782, state open, merged false
- head `8980fb8e87f0abddf3acebe507918f04fb0f6fb6`
- title: feat: Tasks extension for server and client (ext/tasks subpaths)

Node used for imports: v22.23.4.

## Commands

Disposable worktrees were `/tmp/n5-start` at the start commit and `/tmp/n5-recur` at the capture pin. Both were removed after these commands. The pin worktree received a disposable `npm install` so the acceptance module could finish loading. That install is not part of this branch.

| Command | Exit | Count |
| --- | --- | --- |
| `git fetch origin main` | 0 | `origin/main` is `09b2d6155ce247d828355183c9367889daf5f0f0` |
| `git fetch origin da769f7870e494bb583e31766a477a2ff974fc10 633a1ced99bb72e798c4b2195261ec1646d21f82 9f6c0c4e396dd7677f334400eed93e3445fad600` | 0 | 3 commits fetched |
| `git worktree add --detach /tmp/n5-start 09b2d6155ce247d828355183c9367889daf5f0f0` | 0 | 1 worktree |
| `git worktree add --detach /tmp/n5-recur da769f7870e494bb583e31766a477a2ff974fc10` | 0 | 1 worktree |
| Import `decideOrReuse`, `exportReuse`, `previewReuse`, `projectResult`, `n45RecordToObservation`, `assertObservationShape` from the pin worktree | 0 | 6 functions |
| Import `quoteEconomics` and `feePerCapture` from the pin `fee.mjs` | 0 | 2 functions, 0 calls |
| Import `voluntaryMarket` from the pin before `ajv` was installed | 1 | `ERR_MODULE_NOT_FOUND` for package `ajv` from `vendor/hosted-wallet-market/runtime/agent-economy-foundation/dist/contracts.js` |
| Import `proposalFrom` from the pin before `ajv` was installed | 1 | same `ajv` error |
| `node tools/result-reuse/cli.mjs --help` on the pin, with `--help` in the command position | 1 | stderr message: command must be preview, export, or decide-or-reuse. stdout lines: 0 |
| `node tools/result-reuse/cli.mjs` on the pin, no arguments | 2 | usage stdout lines: 16 |
| `node tools/result-reuse/cli.mjs decide-or-reuse --help` on the pin | 0 | usage stdout lines: 16, including the decide-or-reuse lines |
| Start-tree import probe of the seven paths | 0 | probe process caught errors. `decideOrReuse` absent. `projectResult` present. `n45RecordToObservation` present. three paths `ERR_MODULE_NOT_FOUND` |
| `node tools/result-reuse/cli.mjs --help` on the start tree, with `--help` in the command position | 1 | stderr message: command must be preview or export |
| `node tools/result-reuse/cli.mjs` on the start tree, no arguments | 2 | usage stdout lines: 8. The usage has no decide-or-reuse line |
| `npm install ajv@8.20.0 --no-save --ignore-scripts --no-audit --no-fund` in the pin worktree | 0 | 170 packages added in that worktree only. `ajv` `8.20.0` is the version declared by that commit's `package.json` |
| Import `voluntaryMarket` from the pin after that install | 0 | 1 function, 0 calls |
| Import `proposalFrom` from the pin after that install | 0 | 1 function, 0 calls |
| `node experiments/n5-remainder/import-gate.mjs` on this branch | 2 | 7 checks, 6 missing, obligation count 0, delegation count 0, fee line null |

`import-gate.mjs` missing rows:

- `capture-cli`: `MISSING_EXPORT`, export `decideOrReuse` is absent, blob differs from the pin
- `capture-cli-project`: `PIN_BLOB_MISMATCH`, blob `da590948f43daa695d64de2e1fc5e7da27a69061` differs from pin blob `bff16db7f645d27926836ccc2bb8deb4158a41c4`
- `task-acceptance`: `ERR_MODULE_NOT_FOUND`, `vendor/hosted-wallet-market/src/voluntary-market.mjs`
- `rights-check`: `ERR_MODULE_NOT_FOUND`, same path
- `rights-publication`: `ERR_MODULE_NOT_FOUND`, `vendor/hosted-wallet-market/src/accepted-work-publication.mjs`
- `fee`: `ERR_MODULE_NOT_FOUND`, `vendor/hosted-wallet-market/src/fee.mjs`

`capture-cli-map` matched pin blob `8dd669b8d94142b17369567126e88a354d0c47ab` and exported `n45RecordToObservation`.

## Falsifier

The capture CLI pin imported. `decideOrReuse` is a function on `da769f7870e494bb583e31766a477a2ff974fc10`. Its CLI `decide-or-reuse --help` exited 0.

The task acceptance function, the rights check, and the fee function were then imported from the start commit. All three paths are absent there, so the falsifier stopped. The whole-task capture fixture was not run. The split fixture was not run. Complementarity was not scored. No specialist, task, or claim was added.

On the capture pin, after the declared `ajv` package was installed in the disposable worktree, `voluntaryMarket` and `proposalFrom` imported as functions, and `quoteEconomics` imported as a function. Those calls were not made. Those files were not copied onto this branch. The start commit still lacks them, which is the stop.

## Obligation count

0. No experiment store was created. No obligation id was issued. A second run was not reached.

## In-process comparison

The in-process fixture was not run. The import gate stopped first.

- Files touched by the in-process path: 0
- Review minutes for that fixture: unmeasured, because the fixture did not run
- Specialist-only field already present on an in-process path: unknown
- Complementarity result: not reached
- MCP Tasks pull 2782 (`8980fb8e87f0abddf3acebe507918f04fb0f6fb6`) was already qualified and was not rebuilt

## Recovery

There was no experiment-local store to delete. `vendor/hosted-wallet-market`, `tools/result-reuse`, payment, migrations, production routes, accepted-work, pull 446, and pull 636 were left unchanged. Installed runtime `0593026ad155352f263e4749dc889a1578d91675` was not deployed and its commit was not edited. Source integration `9f6c0c4e396dd7677f334400eed93e3445fad600` was not deployed.

## Unknowns

- `epistemedeus/pilot` did not resolve from this environment, so `RECONCILE.md` blob `97c93c4e` and portfolio head `4b294c86` were not read from that repository. The attached plan blob `6e3131ffbb5b89b4a9936c56d0f2de898b540f92` was read.
- H17800's full hash beyond `afe6cbd6` is absent from this repository.
- Whether a later default branch will contain `vendor/hosted-wallet-market` is outside this run. Root owns any install.
- The in-process specialist field was not observed.
- This VM had no `node_modules/ajv` on the start checkout. The pin acceptance module imported only after a disposable install in `/tmp/n5-recur`.

## Bounds

This directory is the only write. The consumer of every output here is synthetic-normal. CONTRIB cases, H17800 `csv.json`, and H17800 `installer.json` were not rerun. No production deploy, price, terms, spend, human page, merge, live funded round, or outside contact was made.

## Run 2

The branch stayed on the default-main history. Retained head `84433df2c489b7c95553f0cc79a40c6cf10dafb7` remains the parent of this run. Input commit `9f6c0c4e396dd7677f334400eed93e3445fad600` was checked out in a detached worktree and was not merged or rebased into this branch. No force-push was used.

### Head, tree, and bases

Commands in this run executed at writer head `84433df2c489b7c95553f0cc79a40c6cf10dafb7`, tree `07468765b2f7a53fd7e1635a42ec3ff5a4aca7f2`.

Run 2 code commit, parent of the receipt commit that adds this paragraph:

- commit `bfb3ffb45ce510bf5eafaa889fe2b41438001f36`
- tree `209810e8045e2cafc55268647fa0816aa0992f9d`
- parent `84433df2c489b7c95553f0cc79a40c6cf10dafb7`

Declared input, and the actual commit read by the runner:

- commit `9f6c0c4e396dd7677f334400eed93e3445fad600`
- tree `8a85072962a71dc1b78b19a0dc0caf17aebac833`
- detached worktree `/tmp/sds-input`
- tracked status of that worktree after the dependency install: clean

Actual writer base:

- default-main history
- `origin/main` `09b2d6155ce247d828355183c9367889daf5f0f0`, tree `0619ee40acd45537fe1fde8723d07152ef09508a`
- retained refusal commit `84433df2c489b7c95553f0cc79a40c6cf10dafb7`, parent `09b2d6155ce247d828355183c9367889daf5f0f0`

The capture CLI pin `da769f7870e494bb583e31766a477a2ff974fc10` and the input commit carry the same seven blob ids. The runner checked those ids with `git hash-object` on the source root before any import. It did not infer the exports from the default-main files.

### Commands

Node remained v22.23.4. The input worktree received `npm install ajv@8.20.0 ajv-formats@3.0.1 --ignore-scripts --no-save --no-package-lock --no-audit --no-fund` so the existing foundation package could resolve the versions declared by that commit (`ajv` 8.20.0, `ajv-formats` 3.0.1). The install added 171 packages under the ignored `node_modules`. No tracked file in the input worktree changed. Installed runtime `0593026ad155352f263e4749dc889a1578d91675` was not deployed and was not edited.

| Command | Exit | Result |
| --- | --- | --- |
| `git fetch origin 9f6c0c4e396dd7677f334400eed93e3445fad600 09b2d6155ce247d828355183c9367889daf5f0f0` | 0 | both commits present |
| `git worktree add --detach /tmp/sds-input 9f6c0c4e396dd7677f334400eed93e3445fad600` | 0 | HEAD `9f6c0c4e396dd7677f334400eed93e3445fad600`, tree `8a85072962a71dc1b78b19a0dc0caf17aebac833` |
| `git worktree add --detach /tmp/sds-main 09b2d6155ce247d828355183c9367889daf5f0f0` | 0 | HEAD `09b2d6155ce247d828355183c9367889daf5f0f0`, tree `0619ee40acd45537fe1fde8723d07152ef09508a` |
| `git worktree add --detach /tmp/sds-missing-file 9f6c0c4e396dd7677f334400eed93e3445fad600`, then remove `vendor/hosted-wallet-market/src/fee.mjs` in that worktree only | 0 | commit and tree unchanged, working file absent |
| `npm install ajv@8.20.0 ajv-formats@3.0.1 --ignore-scripts --no-save --no-package-lock --no-audit --no-fund` in `/tmp/sds-input` | 0 | 171 packages, tracked tree clean |
| `node experiments/n5-remainder/import-gate.mjs` | 2 | 7 checks, 6 missing, delegation 0, obligation count 0, fee line null. Same six missing codes as run 1 |
| `node experiments/n5-remainder/run.mjs --case prove --source-root /tmp/sds-input --wrong-root /tmp/sds-main --missing-root /tmp/sds-missing-file` | 0 | 6 proofs, 0 store writes, 0 fee reads |
| `node experiments/n5-remainder/run.mjs --case pin --source-root /tmp/sds-input --store /tmp/n5-remainder-sentinel-manual` | 0 | positive, seven blobs match, six named exports are functions, sentinel absent |
| `node experiments/n5-remainder/run.mjs --case pin --source-root /tmp/sds-main --store /tmp/n5-remainder-sentinel-manual` | 2 | `wrong_pin`, blob checks not reached, sentinel absent |
| `node experiments/n5-remainder/run.mjs --case pin --store /tmp/n5-remainder-sentinel-manual` | 2 | `missing_source_root`, sentinel absent |
| `node experiments/n5-remainder/run.mjs --case pin --source-root /tmp/sds-n5-absent-root --store /tmp/n5-remainder-sentinel-manual` | 2 | `missing_source_root`, sentinel absent |
| `node experiments/n5-remainder/run.mjs --case pin --source-root /tmp/sds-missing-file --store /tmp/n5-remainder-sentinel-manual` | 2 | `missing_file` for `vendor/hosted-wallet-market/src/fee.mjs`, other six blobs matched, no import, sentinel absent |
| `node experiments/n5-remainder/run.mjs --case whole --source-root /tmp/sds-input --store experiments/n5-remainder/.store` | 0 | reuse, delegation null, falsified false, store absent |
| `node experiments/n5-remainder/run.mjs --case miss --source-root /tmp/sds-input --store experiments/n5-remainder/.store` | 0 | recompute, `digest_mismatch`, delegation null, store absent |
| `node experiments/n5-remainder/run.mjs --case rights --source-root /tmp/sds-input --store experiments/n5-remainder/.store` | 0 | `voluntary_rights_required`, journal 0, local acceptances 0, fee read null |
| `node experiments/n5-remainder/run.mjs --case specialist-fail --source-root /tmp/sds-input --store experiments/n5-remainder/.store` | 0 | direct part kept, remainder unresolved, fee read null |
| `node experiments/n5-remainder/run.mjs --case in-process --source-root /tmp/sds-input --store experiments/n5-remainder/.store` | 0 | comparison negative, files touched 0, store absent |
| `node experiments/n5-remainder/run.mjs --case normal --source-root /tmp/sds-input --store experiments/n5-remainder/.store` | 0 | joined record below, 1 local acceptance, 0 obligations, 1 fee read |
| `node experiments/n5-remainder/run.mjs --case retry --source-root /tmp/sds-input --store experiments/n5-remainder/.store` | 0 | same local acceptance id, 0 new local acceptances, 0 new obligations, 0 fee reads, store not rewritten |
| `node experiments/n5-remainder/run.mjs --case recover --source-root /tmp/sds-input --store experiments/n5-remainder/.store` | 0 | deleted only that store directory, rerun wrote it again, same local acceptance id, 0 new obligations |

`prove` child exits were 0 for the correct pin, 2 for the wrong pin, 2 for a missing source root, 2 for an absent path, 2 for the missing file, and 2 for `import-gate.mjs`. Each refusal left its sentinel directory uncreated.

### Normal useful output

consumer: synthetic-normal

`decideOrReuse` on the bound observation returned `reuse`. `producerInvoked` is false. The observation schema is `neomorphic.task-memory.observation.v1`, produced through `bindUsefulDecision`, which calls `n45RecordToObservation`. Observation id `obs_fd67acedead11d4200e75880a762024a`. Input digest `sha256:574d05880e0f58d314eb890f9ccebe7fec366898e08d2f843ccf8b70acd63cbe`.

`projectResult` on that reused decision returned `ok: false`, kind `unknown`, message `unrecognized result; supply extract-batch, page-change brief, record report, or n45 page-change result JSON`. The direct part below is the field the reuse decision carried.

`decideOrReuse` has no delegation field. `coreDelegation` is null. The whole-task capture hit also has delegation null, so the falsifier did not fire. The joined delegation below is the experiment record of the one named field absent from the capture.

- Direct part: field `directLabel`, value `synthetic-direct-a`, verdict `reuse`
- Remainder id: `specialistNote`
- Missing field: `specialistNote`
- Delegation fields: `specialistNote` only
- Rights decision: `offerVoluntary` allowed license `CC0-1.0` and scope `synthetic-or-authorized-reusable-artifact`
- Publication fence: `proposalFrom` returned schema `pilot.machine-market.accepted-work-proposal.v1`, proposal digest `6c3c8ff387b200de1a049cfaf1577b3f7e16da5d449d0028688fad3adb27a8b5`, applied false
- Specialist output: field `specialistNote`, value `synthetic-remainder-b`
- Joined acceptance: state `accepted`, local acceptance id `1ba4ccc0dc70c29373fe5c642d6aae21aabc8c96e0a36af546675e4f243d0412`
- Core acceptance flags from `voluntaryMarket`: funding `voluntary`, paymentAuthority `none`, paidWork false, debtCreated false
- Obligation id: null. Fit: `no-fit`. `voluntaryMarket` creates no earned-work funding, obligation, verifier receipt, or payment. The local acceptance id is the existing cold-receipt digest. It was not minted as an obligation.
- Fee read: `quoteEconomics({ gross: "2500000", railCost: "0" })`, sent false, persisted false. Function return: rounding profile `commerce-payments-v1.1.0-single-capture`, feeBps 500, grossAtomic `2500000`, railCostAtomic `0`, platformFeeAtomic `125000`, contributorNetAtomic `2375000`, captures one row with amountAtomic `2500000` and feeAtomic `125000`. No fee table row was written.

The specialist value is absent from the reused capture, so the fixture is not a copy of the capture. Complementarity recorded: `field_absent_from_capture`.

### In-process comparison

The in-process path kept the reused direct part and wrote `specialistNote` on that record with delegation null.

- Files touched: 0
- Elapsed: 15426 ns, which is 0.000000257 minutes
- Specialist-only field already present: true
- Comparison: negative

### Failure and recovery

- Capture miss: `decideOrReuse` returned `recompute`, reason `digest_mismatch`, message `before-work public input digest does not match the saved decision`, `producerInvoked` false. Delegation null. The whole task was not delegated. No fee read and no store write.
- Wider remainder right: parent scope `synthetic-or-authorized-reusable-artifact`, remainder scope `synthetic-or-authorized-reusable-artifact-and-downstream`. `offerVoluntary` threw `voluntary_rights_required`. Journal entries 0. Local acceptances 0. No fee read.
- Specialist fixture failure: direct part `synthetic-direct-a` kept. Remainder `specialistNote` unresolved. Specialist output null. Fee read null. Delegation null.
- Retry after the committed local acceptance: local acceptance count 1, new local acceptances 0, new obligations 0, same local acceptance id, `quoteEconomics` calls 0, store file not rewritten.
- Recovery deleted only `experiments/n5-remainder/.store`, then the normal command wrote that directory again. New obligations 0. New local acceptances 1. The local acceptance id matched the deleted run. The store is gitignored and is not part of this commit.

### Limits

The run recorded funding false, account false, commission false, real obligation false, payment false, provider false, outside send false, and fee table write false. `hasFunding` stayed false. `acceptedWorkPublic` stayed false. `exportAuthorized` stayed false. The in-memory adapter answers `task`, `hasFunding`, `coldMutation`, and `evidence` so the existing `voluntaryMarket` and the existing cold-receipt helpers can run. It is not a copied capture, rights, or fee core. No runtime, release, debt, rights, payment, migration, or `tools/result-reuse` source was edited. CONTRIB cases, H17800 `csv.json`, and H17800 `installer.json` were not rerun. MCP Tasks pull 2782 (`8980fb8e87f0abddf3acebe507918f04fb0f6fb6`) was not rebuilt. One writer.
