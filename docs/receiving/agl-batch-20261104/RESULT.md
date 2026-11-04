# AGL receiving batch 20261104

Receiving owner: Pilot Agent Growth Loops Nov4. One remote batch of three finished Growth Loops prototypes. This directory is an independent review and test record. It does not publish, post, message, open an account, spend, merge, or open a pull request.

Base for all three pins: `0593026ad155352f263e4749dc889a1578d91675` (tree `c45303df5350ce899467c840cd0803a1613959a3`).

Runtime: Node `v22.23.4`. Disposable PostgreSQL `16.15` from `/usr/lib/postgresql/16/bin`, selected with `AE14_PG_BIN`. Clusters were loopback scratch clusters started by the existing host harness. The packaged system cluster was not used.

Worktrees were detached checkouts of the received SHAs. Independent cases import those trees through `AGL_CONTRIB_ROOT`, `AGL_RECUR_ROOT`, or `AGL_EMBED_ROOT`. They do not edit the received files.

## Overlap

Changed paths do not overlap.

| Pin | Paths vs base |
| --- | --- |
| CONTRIB | five files under `experiments/agl-contribution-delegation-20261104/` |
| RECUR | `tools/result-reuse/README.md`, `cli.mjs`, `src/export.mjs`, `src/pins.mjs`, `src/project.mjs`, and new `test/decision-reuse.test.mjs` |
| EMBED | `package.json`, `server/lib/observatory/maintained-capability.js`, new `server/scripts/test-capability-owner-lookup.js` |

`git merge-tree` for each pair exited 0. The merge output had no conflict marker.

`package.json` changes on EMBED only. The only script edit appends `server/scripts/test-capability-owner-lookup.js` to `test:observatory`. CONTRIB and RECUR do not change `package.json`.

`npm run test:result-reuse` remains `node --test tools/result-reuse/test/export.test.mjs`. The new `decision-reuse.test.mjs` is outside that script. The builder's claimed command was the `tools/result-reuse/test/*.test.mjs` glob, which does include it.

RECUR imports `tools/recurring-job-recipes/lib/cost.mjs` and `lib/recovery.mjs` and does not modify that directory. EMBED does not touch it.

`maintainedCapabilityFromDocument` has the same function body at base and at the EMBED pin (1768 characters). EMBED adds `lookupCapabilityOwner` after that function. The file header comment gains one sentence.

These blobs are identical at base and at all three pins:

- `vendor/hosted-wallet-market/src/accepted-work-publication.mjs` `b5d8de857f7773edac86221337ad0f144eddb76d`
- `server/scripts/publish-preserved-client.mjs` `1bcb32b8d769428d806c60cf1029db90023c9b0c`
- `vendor/neomorphic-contributor-journey/services/contributor-journey/dist/runtime/src/lib/reward-receiving/publish.mjs` `0992eaf27fbd9774310978a78f2dbb6f3378d85d`

Preview and export stdout for the four builder fixtures were hashed at base and at the RECUR pin. Each pair matched, and each matched the constants in `decision-reuse.test.mjs`:

| Output | SHA-256 |
| --- | --- |
| page preview stdout | `8a6e1cdc6afc88e6f77e197e06b234bb180e098fd9e442988c955fb048f88c5b` |
| n45 preview stdout | `436919a439ea9868a502017800af8b946e88a245b9501687a97b038e08819733` |
| batch preview stdout | `950235ea181c9eb6e10a7ad76d3f9c6e28574de6651b5e986ea9c4b08825957d` |
| record export stdout | `350df9c5b6aab5bede5a42708d422c2dd1c2c641f2e64ec8e8d95c66fe7b0e3f` |
| record export file | `43281361f91b4fe5b7a4b7a6386b1d399d5c38026f8ed482dc51db8201b2f615` |

## CONTRIB

Verdict: DEFECT.

### Identity

- Branch at fetch: `cursor/agl-contribution-delegation-20261104`
- Pin: `3ba5869dcdf2fc58a1d6d09093144075d5d4a231`
- Tree: `3688bcdee3fd7a830c4fa55bf27e766075629a6d`
- Parent: `618b11e5ea23fdbd8b350ba12a4f5e5bbd466ce7`
- Parent of that commit: `0593026ad155352f263e4749dc889a1578d91675`
- Branch tip at the end of this review still equaled the pin.
- `618b11e5` adds the prototype files. `3ba5869d` edits only `experiments/agl-contribution-delegation-20261104/RESULT.md`.
- Draft PR 355 was not modified.

Untouched relative to base: everything outside that experiment directory, including `vendor/hosted-wallet-market`, the cold client, the fee module, and the publication checker.

### Claimed commands

Both were rerun on the pin with `AE14_PG_BIN=/usr/lib/postgresql/16/bin`. That path is also the harness default.

`node --test --test-concurrency=1 experiments/agl-contribution-delegation-20261104/test/contribution-delegation.test.mjs`

Exit 0. tests 4, pass 4, fail 0, skipped 0. `duration_ms 9002.321858`.

`node --test --test-concurrency=1 server/scripts/test-h133010-accepted-work.mjs`

Exit 0. tests 2, pass 2, fail 0, skipped 0. `duration_ms 13499.712671`.

Excerpts: `logs/contrib-delegation.txt`, `logs/contrib-accepted-work.txt`.

### Independent cases

`independent/contrib-independent.test.mjs` on the received pin. Exit 0. tests 2, pass 2, fail 0. `duration_ms 5519.474967`.

- Positive: row `SYN-Z-902` / `mid` / `dock=south` / `gate=2` maps to `workerId SYN-Z-902` and `windowLabel mid`. `dock` and `gate` stay unmapped. The evidence object and the input object are not mutated.
- Failure: a row missing `shift_window` throws `changed_input_field_missing`. A body with the wrong schema throws `artifact_schema_refused`.
- Recovery: after the missing-field throw, the same complete row maps again.
- Host order, different from the builder's single grant then one final withdraw: grant requester C, grant requester E, export both, apply `SYN-Z-902`, lose the `useVoluntary` response, recover with `readback`. The armed drop on `useVoluntary` stayed armed across readback. `downstream_use` went from 0 to 1 and stayed 1. Idempotency grew by one on the lost POST and did not grow on readback. The stored decision was the caller sentence for `SYN-Z-902`, not `SYN-Y-441`.
- Withdrawal then stopped export for C and for E (`voluntary_withdrawn`). A re-grant of C at the new revision returned `voluntary_withdrawn`. A second withdraw at that same revision returned `voluntary_withdrawn`. A later use returned `voluntary_withdrawn`. Consumer rows were 0. `downstream_use` stayed 1.
- Profile stayed unfunded, `signerAuthority` stayed false, `acceptedWork` stayed unset, the financial snapshot was unchanged, and no `eth_send` or sign method was recorded.

`independent/contrib-handback-row.test.mjs` on the received pin. Exit 1. tests 1, pass 0, fail 1. `duration_ms 233.747235`.

### Defect

`handbackDecision` hardcodes the sample row. For applied `{workerId: "SYN-Z-902", windowLabel: "mid"}` the received helper returned:

`Applied implementation X rename to implementation Y row SYN-Y-441. workerId SYN-Z-902 windowLabel mid.`

The row name and the worker id disagree. The shipped journey calls this helper only with `SYN-Y-441`, so that one stored sentence still names the sample row. `applyRosterRename` itself maps a different row correctly, and a caller-supplied decision string is stored as written.

### Amendment

Successor branch `codex/agl-contrib-amend-20261104` from `3ba5869d`.

- Head: `633a1ced99bb72e798c4b2195261ec1646d21f82`
- Tree: `f9df130a5c1ceda2ca7b861a58f4e6ff54f9d383`

The edit replaces the hardcoded row id with `applied.workerId`. For `SYN-Y-441` / `late` the sentence is unchanged:

`Applied implementation X rename to implementation Y row SYN-Y-441. workerId SYN-Y-441 windowLabel late.`

Regression `experiments/agl-contribution-delegation-20261104/test/handback-row-decision.test.mjs`:

- Before the edit: exit 1, pass 0, fail 1. `duration_ms 165.336862`.
- After the edit, one rerun: exit 0, pass 1, fail 0. `duration_ms 175.054944`.

The independent handback file, pointed at that amendment commit, then exited 0 with 1 pass (`duration_ms 183.398997`).

### What remains unestablished

One synthetic later consumer on a disposable host is not outside use, a network effect, or a non-Pilot pair. The computed fee is not a persisted fee event. `acceptedWorkPublic` stayed off. Withdrawal on the installed contract is terminal: re-grant does not restore export. Bytes already exported are not clawed back. No public route was enabled.

Next low-touch check: rerun the new handback regression on `633a1ced`, then one later consumer that is not a synthetic account on this disposable host, still with `acceptedWorkPublic` left unset.

## RECUR

Verdict: PASS.

### Identity

- Branch at fetch: `cursor/agl-recur-public-decision-20261104`
- Pin: `a83647dee019cc2c93cece6c26f414673b34f4eb`
- Tree: `c1da931afbac4bde99c51f0e1240299233738f0f`
- Parent: `0593026ad155352f263e4749dc889a1578d91675`
- Branch tip at the end of this review still equaled the pin.

No amendment. No defect was demonstrated in `decideOrReuse` or in the preview and export bytes.

### Claimed commands

`node --test tools/result-reuse/test/*.test.mjs` on the pin.

Exit 0. tests 34, pass 34, fail 0, skipped 0. `duration_ms 684.951419`.

`npm run test:recurring-job-recipes` on the pin, with no sibling checkout and `MERCHANT_INPUT_ROOT` unset.

Exit 1. tests 90, pass 83, fail 4, skipped 3. `duration_ms 1652.431154`.

The same command at base `0593026a`, same absent sibling:

Exit 1. tests 90, pass 83, fail 4, skipped 3. `duration_ms 1722.070386`.

The four failures and three skips are the same names at both commits:

- not ok 8: `local merchant root and packages resolve without MERCHANT_INPUT_ROOT or network` (`expected sibling x402-url-extractor with name x402-merchant`)
- not ok 9: `local merchant modules export the published C31/C34 field lists` (`assert.ok(root)` falsy)
- not ok 10: `local mocked HTTP serves published C31/C34 routes` (merchant input checkout missing)
- not ok 32: `S25 merchant package contract rejects non-x402-merchant trees` (checkout missing)
- skip: `mounted merchant E2E against C31/C34 contracts`
- skip: `buyer-setup-trace loopback inspection never signs or claims wallet ownership`
- skip: `mounted HTTP origin failure injection surfaces error without payment replay`

They are not caused by the RECUR diff. The suite's existing pin is `epistemedeus/x402-url-extractor` at `f9dd59aeeb200881bc1313ed846ba002e7081258` (`MERCHANT_INPUT_PIN` in `tools/recurring-job-recipes/vendor/merchant-contracts.mjs` and `client/src/data/machineEntry.mjs`). Package name at that commit is `x402-merchant`.

That checkout was placed at `/tmp/merchant-input/x402-url-extractor`. Its own `package-lock.json` was installed with `npm ci --ignore-scripts` so `express` and `ajv` resolve from that tree. `MERCHANT_INPUT_ROOT` stayed unset. The suite then found the checkout through its own candidate list.

Rerun at the RECUR pin: exit 0, tests 97, pass 97, fail 0, skipped 0. `duration_ms 1405.468333`.

Rerun at base: exit 0, tests 97, pass 97, fail 0, skipped 0. `duration_ms 1332.830904`.

The printed test count rises from 90 to 97 because the previously skipped cases run, and the runner counts their subtests. No failure remained. The mounted cases bind `127.0.0.1`. No purchase script was run.

### Independent cases

`independent/recur-independent.test.mjs` on the received pin. Exit 0. tests 7, pass 7, fail 0. `duration_ms 87.950483`.

The saved observation was built in the test from a fresh `pilot.task-commons.page-change-result.v1` object (`https://example.com/receiving/desk-note`, title `Receiving desk note 20261104`). It was not read from `tools/result-reuse/fixtures`.

- Positive: preview and export envelopes of that fresh input both reuse. An extra `annotation` field, which the projector does not keep, does not change the digest.
- Horizon boundary: horizon 24 hours reuses at the exact instant and one millisecond inside it, and recomputes with `stale_clock` one millisecond past it. Horizon 0 reuses at the saved clock and recomputes one millisecond later.
- Digest change: a title-only change recomputes with `digest_mismatch` and a different `inputDigest`. Restoring the title reuses the original digest.
- Opt-in withdrawal: `optIn: false` with `optInWithdrawn: true` recomputes with `opt_in_withdrawn` and does not return a decision. Setting both opt-in and withdrawal fails closed. Omitting opt-in fails closed. A later call with opt-in true reuses the same fresh decision.
- Oversize: a 70000 character title fails the 65536 string bound, a 40000 character title fails the 32768 payload bound, and a saved object over 1048576 bytes fails the input bound. None of those return `reuse`. A following call with the fresh input still reuses.
- Failure: a missing horizon and a saved object that is not `neomorphic.task-memory.observation.v1` fail closed.

### What remains unestablished

A reuse verdict still does not establish a distinct later accepted task, recompute cost avoided, live page bytes beyond the supplied input, or public-safe certification. The digest is the projected public payload: an unprojected field is not a miss. `npm run test:result-reuse` still does not run `decision-reuse.test.mjs`.

Next low-touch check: add that file to the maintained `test:result-reuse` command, or confirm the CI job uses the glob. Do not add a merchant charge to that check.

## EMBED

Verdict: PASS. No amendment was written. The pin checkout was detached and was not pushed.

### Identity

- Branch at the start of this review: `cursor/agl-embed-capability-owner-20261104`
- Tested pin: `87d31c3356350a5cb142bb618fb6c6c588cb26eb`
- Tree: `0f6d247ae164b68cf1e1030b887a9eec2848ecfa`
- Parent: `0593026ad155352f263e4749dc889a1578d91675`

During this review the branch tip moved to `1003b9ec6c3d46826f54a398fce4bb6d0821596f` (tree `fd691a2a7584c41dd25d59525f8f0585b4f4d781`, parent `87d31c33`, subject `Fill owned useful-jobs recipes with the kit's required flags`). That commit changes `maintained-capability.js` and `test-capability-owner-lookup.js` only. It was not checked out, not tested, and not modified.

### Claimed commands

All three were rerun on detached `87d31c33`.

`node --test server/scripts/test-capability-owner-lookup.js`

Exit 0. tests 8, pass 8, fail 0, skipped 0. `duration_ms 103.812256`.

`npm run test:observatory`

Exit 0. tests 100, pass 98, fail 0, skipped 2. `duration_ms 1695.343975`.

Skips: `configured historical capture keeps its clocks and labels` (`optional historical capture is not configured`) and `optional live OBSERVATORY_LIVE real GETs for the three fixed URLs` (`OBSERVATORY_LIVE is not 1`). Live GETs were not enabled.

`npm run test:useful-jobs-public`

Exit 0. tests 28, pass 28, fail 0, skipped 0. `duration_ms 6681.424359`.

### Independent cases

`independent/embed-independent.test.mjs` on the received pin. Exit 0. tests 5, pass 5, fail 0. `duration_ms 69.662711`.

- Exact id: `{jobId, skill, need}` all set to `feed-agenda` is `owned`, review `inherited`, version `1.4.7`, argv `["node", "bin/useful-jobs.mjs", "run", "feed-agenda"]`. The argv array is frozen.
- Version mismatch: version `1.4.6` with approved version `1.4.7` is `no-fit` / `version_not_approved`, and the result text does not contain `1.4.6`. Version `1.4.7 ` (trailing space) is the same refusal. The untouched live document still owns `feed-agenda` at `1.4.7`.
- Removed id: dropping `feed-agenda` from `jobs` and both release lists makes that id `unknown_need`. `route-table-diff` stays `owned` and `newly_reviewed`. The live document still owns `feed-agenda`.
- Malformed discovery: `null`, a number, an array, an empty object, a string, a one-sided removal of `feed-agenda` from `jobs` only, a duplicate `feed-agenda`, and `releaseScope: null` are all `malformed_discovery`. `maintainedCapabilityFromDocument` still throws `useful_jobs_discovery_invalid` for each. The live lookup still owns `feed-agenda` afterward.
- Near misses `feed-agend`, `feed-agenda `, ` feed-agenda`, `FEED-AGENDA`, and `route-table` are `unknown_need`, not prefix hits.

### What remains unestablished

The lookup's own `cannotEstablish` list still stands: distinct later accepted tasks, rebuild effort saved, that an unmatched need has no owner outside this discovery document, and that an inherited job and a newly reviewed job differ as executables. This review does not cover branch tip `1003b9ec`.

Next low-touch check: when that same-owner amendment is offered as its own pin, review that SHA on its own. For the pin reviewed here, a caller can look up one exact id from `client/public/discovery/useful-jobs.json` and should not mount a route or copy the job list into a second source.

## Receipt

| Pin | Verdict | Claimed counts | Independent counts | Amendment |
| --- | --- | --- | --- | --- |
| CONTRIB `3ba5869d` | DEFECT | 4 pass / 4, and 2 pass / 2 | host file 2 pass / 2; handback file 0 pass / 1 fail | `codex/agl-contrib-amend-20261104` `633a1ced99bb72e798c4b2195261ec1646d21f82` |
| RECUR `a83647de` | PASS | result-reuse 34 pass / 34. Recurring without sibling 83 pass / 4 fail / 3 skip, same at base. With sibling `f9dd59ae`, 97 pass / 0 fail / 0 skip at the pin and at base | 7 pass / 7 | none |
| EMBED `87d31c33` | PASS | lookup 8 pass / 8. Observatory 98 pass / 2 skip of 100. Useful jobs 28 pass / 28 | 5 pass / 5 | none. Later branch tip `1003b9ec` was not reviewed |

Log excerpts are under `logs/`. Independent case files are under `independent/`.

## Follow-up batch

Same rules: no production, spend, publication, pull request, or merge. EMBED stayed read-only. CONTRIB was not edited again. The RECUR help line was already present, so it was not rewritten.

### EMBED changed regression: PASS

Detached checkout only. The branch was not written and was not pushed.

- SHA: `1003b9ec6c3d46826f54a398fce4bb6d0821596f`
- Tree: `fd691a2a7584c41dd25d59525f8f0585b4f4d781`
- Parent: `87d31c3356350a5cb142bb618fb6c6c588cb26eb`

`node --test server/scripts/test-capability-owner-lookup.js`

Exit 0. tests 10, pass 10, fail 0, skipped 0. `duration_ms 1235.62596`.

`npm run test:observatory`

Exit 0. tests 102, pass 100, fail 0, skipped 2. `duration_ms 2063.65681`.

The two skips are the same optional cases as the earlier pin: historical capture is not configured, and `OBSERVATORY_LIVE` is not 1. Live GETs stayed off. The count is 102 because this pin's lookup file has 10 tests and `test:observatory` includes that file.

`npm run test:useful-jobs-public`

Exit 0. tests 28, pass 28, fail 0, skipped 0. `duration_ms 7361.49864`.

Second kit run. The discovery `coldStart` string was executed with bash. `USEFUL_JOBS_ORIGIN` was a loopback server of `client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz`. That file is 5255824 bytes and sha256 `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec`, matching the discovery pin. Acquire exited 0. The kit list named all ten current job ids, including `feed-agenda`.

The owned job was `feed-agenda` (inherited, required flags `--before` and `--after`), not `vendor-budget-impact`. The feeds were a fresh Atom pair written for this run: a kept note, a retired note, and an added note. Bound argv began `node bin/useful-jobs.mjs run feed-agenda`.

Stdout excerpt:

```json
{"ok":true,"appId":"feed-agenda","status":"actionable","digest":"f8b1eb8a7e05122a","events":2}
```

`agenda.json` for those same feeds names two events: added `Added desk note`, and removed `Retired desk note`. A second execution of the same feeds also exited 0 with `events` 2 and status `actionable`. Its stdout digest was `cba19710b8d745e0`. The kit digest includes the caller record, and the scratch paths differed, so the digest is not a stable content id across runs.

No-fit id `not-a-maintained-job`: lookup outcome `no-fit`, reason `unknown_need`, `callRecipe` null. Running that id in the acquired kit exited 2 with `{"ok":false,"error":"unknown job not-a-maintained-job"}`.

### CONTRIB amendment rerun: PASS

No further edit. Commands once on `codex/agl-contrib-amend-20261104` at `633a1ced99bb72e798c4b2195261ec1646d21f82`, tree `f9df130a5c1ceda2ca7b861a58f4e6ff54f9d383`, parent `3ba5869d`.

`node --test --test-concurrency=1 experiments/agl-contribution-delegation-20261104/test/handback-row-decision.test.mjs`

Exit 0. tests 1, pass 1, fail 0, skipped 0. `duration_ms 402.402455`.

`AE14_PG_BIN=/usr/lib/postgresql/16/bin node --test --test-concurrency=1 experiments/agl-contribution-delegation-20261104/test/contribution-delegation.test.mjs`

Exit 0. tests 4, pass 4, fail 0, skipped 0. `duration_ms 8075.753726`.

`AE14_PG_BIN=/usr/lib/postgresql/16/bin node --test --test-concurrency=1 server/scripts/test-h133010-accepted-work.mjs`

Exit 0. tests 2, pass 2, fail 0, skipped 0. `duration_ms 13649.126262`.

### RECUR maintained-script gap: PASS

Successor `codex/agl-recur-amend-20261104` from `a83647dee019cc2c93cece6c26f414673b34f4eb`.

- Head: `369dfbf5c27de5e72db7554550b219c7b1b1629c`
- Tree: `f9ed4d493e7fc79cf6f6ac279d25e82863cc4beb`
- Parent: `a83647dee019cc2c93cece6c26f414673b34f4eb`

The only change is the `test:result-reuse` script. It now runs `tools/result-reuse/test/export.test.mjs` and `tools/result-reuse/test/decision-reuse.test.mjs`.

Base help text contains `Default outputs of page-change and record stay intact.` The same sentence is already line 82 of `tools/result-reuse/cli.mjs` at `a83647de`. It was not dropped, so it was not restored and the help text was not edited.

Before the script edit, `npm run test:result-reuse` ran only `export.test.mjs`. Exit 0. tests 23, pass 23, fail 0, skipped 0. `duration_ms 217.779216`. The log has no decide-or-reuse test names.

After the edit, the same command ran both files. Exit 0. tests 32, pass 32, fail 0, skipped 0. `duration_ms 260.460506`. The nine decision tests are in that count, including the saved-decision hit, the digest miss, the withdrawn opt-in, the oversize input, and the byte-identical preview and export check.

`git merge-tree --write-tree` of this head with `1003b9ec` exited 0. The merged `package.json` keeps both lines: `test:result-reuse` names the two result-reuse files, and `test:observatory` still ends with `server/scripts/test-capability-owner-lookup.js`.

`record-fields.test.mjs` remains outside `npm run test:result-reuse`, as it was at `a83647de`. The earlier glob `tools/result-reuse/test/*.test.mjs` is still the command that covers all three files.

## RECUR source gate

Same rules: no production, spend, publication, pull request, or merge. CONTRIB `633a1ced` and EMBED `1003b9ec` were not touched. This section is the only edit on the receiving branch.

Successor of `369dfbf5c27de5e72db7554550b219c7b1b1629c` on `codex/agl-recur-amend-20261104`.

- Head: `da769f7870e494bb583e31766a477a2ff974fc10`
- Tree: `e34d2a883546e5c8b1b167d831ca0c7d6526b9b6`
- Parent: `369dfbf5c27de5e72db7554550b219c7b1b1629c`

Files changed: `package.json`, `tools/result-reuse/README.md`, `tools/result-reuse/cli.mjs`, `tools/result-reuse/src/export.mjs`, `tools/result-reuse/src/pins.mjs`, `tools/result-reuse/test/decision-reuse.test.mjs`, `tools/result-reuse/test/source-gate.test.mjs`.

`tools/result-reuse/src/project.mjs` and `tools/result-reuse/src/map.mjs` are unchanged. `previewReuse` is still called only by `exportReuse`. `decideOrReuse` no longer calls it.

### Countercase

At `369dfbf5`, `node --test tools/result-reuse/test/source-gate.test.mjs` exited 1. tests 5, pass 0, fail 5, skipped 0. `duration_ms 293.690604`.

The first assertion failed because `decideOrReuse` answered the before-work manifest with `unrecognized result; supply extract-batch, page-change brief, record report, or n45 page-change result JSON`. A hit required that finished result. The CLI cases failed with `unknown option` because `--produced` did not exist.

After the fix, the same file exited 0. tests 5, pass 5, fail 0, skipped 0. `duration_ms 721.052712`. The countercase now returns the saved useful decision (`outcome` `unchanged`, recovery `keep_prior`) from the before-work manifest. Its `inputDigest` is the manifest digest, not the result content hash `sha256:fixture-example-domain-v1`.

### Tests

`npm run test:result-reuse` exited 0. tests 37, pass 37, fail 0, skipped 0. `duration_ms 709.690781`.

- `export.test.mjs`: exit 0. tests 23, pass 23, fail 0, skipped 0. `duration_ms 229.34046`.
- `decision-reuse.test.mjs`: exit 0. tests 9, pass 9, fail 0, skipped 0. `duration_ms 275.367033`. Legacy result observations now expect `unbound_legacy` rather than a result-hash hit. The preview and export byte hashes in that file still match.
- `source-gate.test.mjs`: exit 0. tests 5, pass 5, fail 0, skipped 0. `duration_ms 721.052712`.
- `record-fields.test.mjs` is still outside the maintained script. Run on its own: exit 0. tests 2, pass 2, fail 0, skipped 0. `duration_ms 57.141582`.

`git merge-tree --write-tree` of `da769f78` with `1003b9ec` exited 0. The merged `package.json` keeps this `test:result-reuse` line and EMBED's `test:observatory` line.

### CLI excerpts

Hit, after one real `source-change-alert` run, with the producer not executed:

```json
{"ok":true,"verdict":"reuse","inputDigest":"sha256:ee025b1a337e17afda633aa4ec4ed66ec69e27113993386bb82184cd2e3aad6c","revision":"rev_1","recipeId":"source-change-alert","decision":{"statement":"source-change-alert unchanged; recovery keep_prior","useful":{"outcome":"unchanged","recovery":{"action":"keep_prior"}}}}
```

Changed capture, recompute-required, with no invented outcome:

```json
{"ok":true,"verdict":"recompute","reason":"digest_mismatch","message":"before-work public input digest does not match the saved decision","inputDigest":"sha256:efdc2055bd751884b31d7de8bcbf9d8de87a57784eb783d94311fe0ece498664","savedInputDigest":"sha256:ee025b1a337e17afda633aa4ec4ed66ec69e27113993386bb82184cd2e3aad6c","producerInvoked":false}
```

### What was avoided, and the capture cost

The useful job is the existing `source-change-alert` recipe CLI. It ran once for the unchanged fixture pair. That run measured `producerRunNs=51043967`. The hit then named a stub that appends to a counter file and throws. Executing the stub directly appended one mark and exited non-zero. During the hit the counter stayed empty, so the producer was not invoked. The CLI field `producerInvoked: false` is not that proof.

On that same hit the manifest digest measured `inputCaptureNs=79183` and `inputCaptureBytes=527`. A later hit of the same manifest measured `inputCaptureNs=135143` for the same 527 bytes. The digest work and the producer run are separate measurements. They are not a priced saving.

The same file also covers a changed capture, a recipe version change, a revision change, the stale horizon and the exact horizon, withdrawn opt-in, an observation with its useful decision removed, a private `token` that is absent from the refusal and from the stored observation, a changed-capture recovery (`review_and_sequence`), and an independent CLI run on a new North dock capture.

### Preserved bytes

`git diff` for `project.mjs` and `map.mjs` is empty. `decision-reuse.test.mjs` still checks the previous preview and export stdout and file hashes, and that test passed.

### Unknowns

Live page bytes beyond the supplied manifest, a distinct later accepted task taking this reuse, recompute cost avoided net of upkeep, public-safe certification, and merchant acceptance stay unestablished. `recomputeCostAvoidedNetOfUpkeep` remains `costs_unknown`. Only `source-change-alert` is accepted as the before-work manifest. Other useful jobs are not bound by this change.
