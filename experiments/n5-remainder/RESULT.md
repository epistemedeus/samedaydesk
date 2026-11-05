# N5-REMAINDER receipt

consumer: synthetic-normal

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
