# Acquisition receiving 141410

One integrated SameDayDesk candidate. Original-task acquisition and the open-job positioning cut, from the same baseline. No main merge and no deploy.

## Source pins

| Pin | Value |
| --- | --- |
| Baseline | `3db8220c9008bc315ab6e25a970bcf7ea3559312` |
| Original-task export | `fb4b6129606bac896467f1ef54ccd4e599441879` on `codex/task-native-acquisition-141400` |
| Traffic export | `8910113935b83fa80b9cd762050435bc355c73c6` on `codex/traffic-convergence-141300` |
| Traffic implementation | `653eb9c3e24bb329ff9ce057307fc3a732a0ccc7` |
| Merge | `6411ea7c09b212f43d56fbe5fba91aac5ac32309` |
| This implementation | `1fb44c29a59043a2b440637faca5e48ba12b7e37` |
| Product branch | `codex/acquisition-receiving-141410` |
| Caller closure base | `08b90bdef8dbd198023be447942a3119cb268235` |
| Source pin sha256 | `02d42a4d5777ae94082547dabc842c9ff035afc0354e1e7678ced72daef18e15` |
| Current caller closure | `sha256:b4c7954b8f1ce4a333440047acdaab95dc87eae127d76fbab217ccd07d995685` |
| Appended prior closure | `sha256:1e43f06ccb6158d9e676f1e4737285dcbf0e85ed5b162f21d846112abbee513e` |
| Retained prior closure | `sha256:7c5d16672e263c2f8672bbfe0a1065dac94f2cb057d6fe6e44b8a8a37ceb0a61` |
| Prior closures accepted | 14 |
| Predecessor archive | `d9d7c1a4cb426e89eed2ac12b2df22305d81ed0933fdc2ef5785d86ed5f6be08`, 23506 bytes |
| Published archive | `9b5b9bf82119d7c8c0d4e277e34e85f6e9c0711ed4cfc84017c7a79b47bed887`, 23811 bytes |
| Discovery document | `4c4f85571c4370d4668e1a8ba876f137806363786157768b6db08184904ee119` |
| useful-jobs source | `client/public/discovery/useful-jobs.json`, package `useful-jobs` 1.4.7, 10 ids in `jobs` |
| useful-jobs archive | `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec`, 5255824 bytes, not rewritten |
| skill.md | `46a5a9ef0cf9394a6d68f4a541b5e89c2dee3b702d0c8eff454636018211b5e9` |
| openapi.json | `afd1d544c84370d56f6f84945b912a97e05f1be4d7f0b03fbe3a94fe17c5deb8` |
| api-catalog | `5cad917c648659c5880216cb113b4c16348f32f99ebb6d90a76e9ac39594328b` |
| Run | `bc-801f3b4c-45ac-41c7-95fb-fb289cd84f4d` |
| Model | `grok-4.7` |
| Tokens / charged cents | unknown |

The two original RESULT files and `research/traffic-convergence-141300/capture-summary.json` are unchanged. Sections 141100, 141200, 141600, and 141700 were not started.

## What changed

The jobs listing schema does not define an ordinary-purpose complement. `PLATFORM_MARKETING` and `PLATFORM_REFERRAL` stay `platform_program`. Any other closed token is `unclassified`. `ordinary_rows` stays zero. Missing and invalid purposes increment `unclassified_rows` and do not enter the histogram.

Duplicate metric keys invalidate every copy of that key. A duplicate purpose token, a bad purpose entry, or a non-integer purpose count withholds the whole histogram. A purpose count, or the sum of purpose counts, above `returned_rows` blocks the decision. Negative, nonfinite, and wrong-type quantities are `invalid` and are not usable. Decimal USDC and USD text stays supported. Planes stay non-additive. A missing population or window stays unspecified. Core-only input still names the discovery package and withholds the rank. A stale open page withholds the rank and sets the decision `stale`.

Job ids come from `jobs` in `client/public/discovery/useful-jobs.json`. `releaseScope.newlyReviewedJobIds` and `inheritedJobIds` must be that same set. A drifted copy throws. Immutable useful-jobs archives were not edited.

`map` still corresponds to existing visitor correspondence. It does not pay, enroll, or execute. A symlink secret, a symlinked private directory, or a symlink in a parent path is `missing_private_authority`. A rewritten `mapCommand`, or `taskAction.payment` true, is `stale_discovery`. `nextCommand` stays the code constant.

## Preserved capture

Capture `20261010T040538Z` is unchanged: 10 returned rows, all `PLATFORM_REFERRAL`, exact useful-jobs skill matches 0, `meetsMaintainedExecution` `no_exact_overlap`, inbound use unobserved. Replaying that stored observation still ranks `purpose:PLATFORM_REFERRAL` 10/10. It is a platform-program page, not a customer funnel, not ordinary marketplace demand, and not inbound SameDayDesk use. The provider clock on that page is missing, so freshness is the capture fetch time.

## Cold fixture

Owner QA on loopback, archive extracted under a CommonJS parent. The published submit command still names `https://samedaydesk.com/api/correspondence`. The fixture host was `127.0.0.1`.

```
original-task-action-evidence {"archiveSha256":"9b5b9bf82119d7c8c0d4e277e34e85f6e9c0711ed4cfc84017c7a79b47bed887","archiveBytes":23811,"action":"submit_existing_correspondence","payment":false,"archiveBound":true,"restartedAction":"read_existing_attempt","continuation":"same_private_read","handleScope":"private_directory","laterDisposition":"scoped_result","wrongHandle":"handle_scope","feedbackConsent":true,"feedbackAccepted":false,"missingDiscovery":"stale_discovery","staleDiscovery":"stale_discovery","spoofedDiscovery":"stale_discovery","crossDirectory":"handle_scope","expiredDisposition":"expired","fixtureHost":"127.0.0.1","publishedSubmitHost":"samedaydesk.com"}
```

Journey: catalog, discovery, archive download, bind, extract, `map`, `submit`, second-process `map`, `read`, operator `scoped_result`, example consent with `accepted` false, missing and stale and spoofed discovery, cross-directory handle, then expiry. Map still returns `read_existing_attempt` while local files remain. The following `read` returns disposition `expired`.

## Gates

From `/opt/cursor/work/samedaydesk-141410`:

| Command | Result |
| --- | --- |
| `npm run test:original-task` | 14 passed |
| `npm run test:observatory` | 58 passed, 1 skipped |
| `npm run test:observatory-capture` | 14 passed |
| `npm run test:machine-discovery` | 4 passed |
| `node --test --test-concurrency=1 server/scripts/agent-readiness/http-mcp.test.js` | 4 passed |
| `npm run test:proxy-addr` | 7 passed, including both caller-closure tests |
| `npm run build` | client install, vite build, and route shells completed |

The observatory skip is `OBSERVATORY_LIVE` unset. That live runner stays unknown. The machine-discovery checker recorded no response for `/llms.txt` and `/.well-known/x402`. Those documents were not read. That is not evidence they are valid or absent.

Positive projection cases: a platform token still ranks on `returned_rows`; an unknown token such as `ORDINARY_WORK` is `unclassified` with inference null; core-only stays useful; marketplace stock is not borrowed as the open queue; the stored ten-referral page still has no exact skill overlap.

Hostile projection cases: negative, infinite, and object quantities withhold the rank and do not appear as usable values; duplicate metric keys withhold with `duplicate_metric`; duplicate purpose entries withhold with `duplicate_purpose`; a purpose tally above the returned-row denominator blocks the decision; stale input sets decision `stale` and withholds the rank.

Hostile original-task cases: spoofed map command, payment task action, missing discovery file, stale visitor entry, spoofed submit command, symlink secret, symlink directory, symlink parent, wrong handle, cross-directory handle, and an expired grant. Conflict still wins over missing authority when a real directory's receipt and continuation disagree.

`verifyCallerClosure()` accepted the current pin and all 14 priors. A mutated runtime member throws `caller_source_changed`.

## Known limits

Fixture success is owner QA. It is not a live signup, an outside agent choice, task acceptance, settlement, or revenue. The live discovery URL is unknown until Root deploys and reads it back. Hermes and ClawHub distribution are unknown. Run token counts and `chargedCents` were absent from run-info.

No global census, extra dashboard, freshness schedule, catalog offer, homepage copy, or human-page design change. `client/package-lock.json` gained an npm `libc` rewrite during `npm run build` and was restored, so the pin still matches the committed lock.

## Root publish commands

```
git fetch origin codex/acquisition-receiving-141410
git checkout codex/acquisition-receiving-141410
git rev-parse HEAD
```

After a deploy Root chooses, fetch `https://samedaydesk.com/discovery/original-task-correspondence.json` and compare `acquisition.archive.sha256` with `9b5b9bf82119d7c8c0d4e277e34e85f6e9c0711ed4cfc84017c7a79b47bed887` and `bytes` with 23811. Until that readback, do not treat the live URL as this archive. Do not overwrite useful-jobs immutable archives. Main merge and deployment stay with Root.
