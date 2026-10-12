# RECEIVING-2111016

Receiving correction of the ordinary L08 caller. Owner QA on this VM. No outside caller, customer acceptance, quote, payment, repair, or savings is established.

## Pins

| Pin | Value |
| --- | --- |
| Main | `d760714c932fd317e1435b528575fecd95594183` |
| Main tree | `8bdc2f0fedd0aaa13b53b2daeff4d47dd44428d0` |
| Unmerged caller product | `58b19a7d4e29caea8a56fede825bc616d430d873` |
| Unmerged caller tree | `f5b1073bef68c4210ee02313656de06eeb300fd2` |
| This correction | `b45c44286baa79c2a39202f9b7eba685b9528713` |
| This correction tree | `f3f4520efac98a364c526f1dc4e6a4e42194858f` |
| Branch | `codex/task-readiness-caller-receiving-2111016` |
| Caller feature | `codex/task-readiness-caller-2111013` |
| Owned pointer | `data.quote` |
| Owned pattern | `^\d+(\.\d+)?$` |
| Caller pin | `00267aeb03c3ce01b9b318f5ee0172aee34d7e34` |
| Node | `v22.14.0` |

`bbed7bdf6fb03503b08883121f439a083bd4006a` remains the 2111013 receipt on `codex/task-readiness-caller-2111013`. This branch starts at the product commit and does not rewrite that receipt. `classifySchema` is still the historical required-path check and is re-exported unchanged. A nullable quote schema and an optional `data` object still pass `classifySchema`.

## Red, before this correction

On `58b19a7d`, `diagnoseCallerContract` returned `decimal_match` with schema pass for a sample quote `4.50` in every case below. `Date.parse("2099-02-30T00:00:00.000Z")` returned `4076092800000`, which is `2099-03-02T00:00:00.000Z`, so the impossible day was accepted.

| Input | Red next action |
| --- | --- |
| Quote type string, no decimal restriction | `decimal_match` |
| Owned pattern, `data` not required | `decimal_match` |
| `data` type `["object","null"]` | `decimal_match` |
| `quote` schema absent | `decimal_match` |
| `quote` schema `{}` | `decimal_match` |
| `const` `"soon"` | `decimal_match` |
| `const` `"4.50"`, sample `"9"` | `decimal_match` |
| `pattern` `^[a-z]+$` | `decimal_match` |
| `minLength` 8, sample `"4.50"` | `decimal_match` |
| Root type absent | `decimal_match` |
| Deadline `2099-02-30T00:00:00.000Z` | `decimal_match` |

## Green

`schema` is this sample's shape. `semantic` is this sample's decimal check. `guarantee` is whether every permitted future `data.quote` is a decimal string. `decimal_match` requires shape pass, semantic pass, and `guarantee` `proved`.

| Input | Fit | Shape | Semantic | Guarantee | Next action |
| --- | --- | --- | --- | --- | --- |
| GET `/estimate`, owned pattern, quote `4.50` | diagnosed | pass | pass string | proved | `decimal_match` |
| POST `/desk`, const `"10"` | diagnosed | pass | pass string | proved | `decimal_match` |
| Owned pattern, quote `later` | diagnosed | pass | fail string | proved | `value_mismatch:data.quote:string` |
| Owned pattern, `data` optional, quote `4.50` | diagnosed | pass | pass string | unproved | `required_not_guaranteed:data` |
| `data` nullable, quote `4.50` | diagnosed | pass | pass string | unproved | `type_not_guaranteed:data` |
| Quote schema absent, quote `4.50` | diagnosed | pass | pass string | unproved | `quote_schema_absent:data.quote` |
| Quote schema `{}`, quote `4.50` | diagnosed | pass | pass string | unproved | `type_not_guaranteed:data.quote` |
| Type string only, quote `4.50` | diagnosed | pass | pass string | unproved | `guarantee_unproved:data.quote` |
| `const` `"soon"`, quote `4.50` | no_fit | not invoked | pass string | unsupported | `const_not_decimal:data.quote` |
| `const` `"4.50"`, quote `9` | diagnosed | fail | pass string | proved | `const_mismatch:data.quote` |
| Pattern `^[a-z]+$`, quote `4.50` | no_fit | not invoked | pass string | unsupported | `pattern_unsupported:data.quote` |
| Owned pattern, `minLength` 8, quote `4.50` | diagnosed | fail | pass string | proved | `length_mismatch:data.quote` |
| Root type absent | diagnosed | pass | pass string | unproved | `type_not_guaranteed` |
| `minLength` 1.5 | no_fit | not invoked | pass string | unsupported | `schema_malformed` |
| `allOf` and `oneOf` | no_fit | not invoked | pass string | unsupported | `schema_unsupported` |
| Quote number `9` | diagnosed | fail | fail number | proved | `type_mismatch:data.quote` |
| Deadline `2099-02-30T00:00:00.000Z` | refused | | | | `deadline_invalid` |

`2099-02-29` and `2099-04-31` also refuse as `deadline_invalid`. Real leap day `2096-02-29T00:00:00.000Z` is accepted. `paymentSent`, `repairPosted`, and `routeFetched` stayed false. No schema pattern was compiled and no route was fetched.

## Supported scope

A proved schema is root type `object` with `data` required, `data` type `object` with `quote` required, `quote` type `string`, and one of: pattern exactly `^\d+(\.\d+)?$`, a decimal `const`, or a non-empty decimal `enum`. `minLength` and `maxLength` check this sample only. Annotations do not change the result. Combinators, foreign patterns, non-decimal const, and malformed keywords are no-fit. The package README at `tools/l08-agent-repair/README.md` shows one caller JSON and this reading.

## Commands

| Command | Exit | Count |
| --- | --- | --- |
| `node --test --test-concurrency=1 tools/l08-agent-repair/test/caller-readiness.test.mjs` | 0 | 9 pass, 0 fail, 464.620 ms |
| `npm run test:l08-agent-repair` | 0 | 28 pass, 0 fail, 19836.060 ms |
| `node tools/l08-agent-repair/scripts/cold-caller-2111013.mjs` | 0 | pack 0, install 0, four installed cases agree |
| `npm test` | 1 | root `package.json` has no `test` script |
| `npm --prefix tools/l08-agent-repair test` | 1 | caller package has no `test` script |
| `npm --prefix tools/l08-agent-repair run build` | 1 | caller package has no `build` script |
| `npm run build` | 0 | client install of 190 packages, then `tsc`, Vite, and route shells |

Before `npm run build`, `client/node_modules` and `client/dist` were absent. That absence is a client prerequisite, not a failure of this caller. The build created them. It also dropped optional `libc` fields from `client/package-lock.json`. That lockfile diff is not part of this product and was not committed. No catalog file was copied by hand. The committed task-readiness catalog assertion stayed green. Hidden import of `task-readiness.mjs` exited 1 with `ERR_MODULE_NOT_FOUND` for `express`. Hidden import of the pure module, including the installed copy, exited 0.

Cold tarball `samedaydesk-task-readiness-caller-0.1.0.tgz`, 8052 bytes, shasum `5c2c756bcd62567852b0fc54c89ac69b8a5eb643`. Install 211.615 ms. Installed CLI and the same installed function agreed. GET `/estimate` quote `4.50` was CLI exit 0 in 27.852 ms and direct `decimal_match` in 1.030 ms. Optional `data` with quote `10` was CLI exit 1 in 25.836 ms and direct `required_not_guaranteed:data` in 0.101 ms. `savingsClaim` is false. `cost` is `{state:"unknown", amount:null, currency:null}`.

## Child cleanup

Caller tests and the cold script use `spawnSync`. The cold temp directory was removed in `finally`. No `task-readiness-caller` process remained. The L08 run rewrote `TASK-READINESS-RECEIPT.json` and `MAINT-HANDOFF.json`. Those generated diffs were not committed.

## Root integration

Root owns merge and release. From main, this commit brings the unmerged caller `58b19a7d` and the correction:

```
git merge --no-ff b45c44286baa79c2a39202f9b7eba685b9528713
```

The receipt commit is evidence and is not required to run the module. Do not deploy, publish the package, or change human pages.
