# RECEIVING-2111013

Ordinary caller input for the maintained L08 decimal readiness contract. Owner QA on this VM. No outside caller, customer acceptance, quote, payment, repair, or savings is established.

## Why this is not a no-delta

Current `main` `d760714c932fd317e1435b528575fecd95594183`, tree `8bdc2f0fedd0aaa13b53b2daeff4d47dd44428d0`, has no command that accepts a caller-owned method, path, JSON schema, value, and semantic contract and returns separate shape and decimal facts without Express.

`public-cold-client.mjs` is `begin|resume|offline` against a supplied catalog row. Offline loads `auditSuppliedRow`. `cold-client.mjs task-readiness` takes no caller JSON and imports `task-readiness.mjs`, which imports `server/app.js`. Contract repair is a different path. None of those is this outcome.

## Source pins

| Pin | Value |
| --- | --- |
| Base | `d760714c932fd317e1435b528575fecd95594183` |
| Base tree | `8bdc2f0fedd0aaa13b53b2daeff4d47dd44428d0` |
| Product | `58b19a7d4e29caea8a56fede825bc616d430d873` |
| Product tree | `f5b1073bef68c4210ee02313656de06eeb300fd2` |
| Branch | `codex/task-readiness-caller-2111013` |
| Feature | `codex/task-readiness-caller-2111013` |
| Owned pointer | `data.quote` |
| Owned pattern | `^\d+(\.\d+)?$` (`PRICE_PATTERN.source`) |
| Caller pin | `00267aeb03c3ce01b9b318f5ee0172aee34d7e34` (`S14_PIN`) |
| Stale pin | `259ea74da295f12d64e2aae9cb2042c4a14c6b96` (`STALE_NEO`, refused `stale_pin`) |
| Private neo | `de9c23b5d19de30874e432e7ef1193d0d02d6702` (refused `pin_mismatch`, not fetched) |
| Node | `v22.14.0` |

The pure module is `tools/l08-agent-repair/lib/readiness-contract.mjs` (51 lines, no imports). The caller is `lib/caller-readiness.mjs` (224 lines) plus `task-readiness-caller.mjs` (81 lines). Bounds live in `lib/supplied-bounds.mjs` (73 lines) and `supplied-row.mjs` re-exports them. `task-readiness.mjs` re-exports the original decimal functions and still imports `server/app.js`.

`211879` and `211985` receipts and the experimental selector stay on `cursor/pilot-211860-task-native-distribution-and-cold-selection-experiment-d4c4` at `284a47db8bc1765034241355a5e6314e0011049c`. This branch was cut from main and does not modify them. Product `6c2ee316fd623cbdf3c3bbefc1a245ccffc49331` remains the conditional seven-case experiment.

## Commands

| Command | Exit | Count |
| --- | --- | --- |
| Hidden import of `lib/task-readiness.mjs` (express specifier refused) | 1 | `ERR_MODULE_NOT_FOUND` Cannot find package `express` |
| Hidden import of `lib/readiness-contract.mjs` | 0 | empty stderr |
| `node --test --test-concurrency=1 tools/l08-agent-repair/test/caller-readiness.test.mjs` | 0 | 8 pass, 0 fail, 527.797 ms |
| `npm run test:l08-agent-repair` | 0 | 28 pass, 0 fail, 20314.196 ms |
| `node tools/l08-agent-repair/scripts/cold-caller-2111013.mjs` | 0 | pack 0, install 0, three installed cases agree |

`npm run test:l08-agent-repair` rewrote `TASK-READINESS-RECEIPT.json` and `MAINT-HANDOFF.json`. Those files were restored and are not part of this change. Historical L08 assertions were not weakened. No fixture file was edited.

Express is installed in this checkout, so a natural import of `task-readiness.mjs` is not the red condition. The red condition is the same loader refusing the `express` specifier. The pure module has no import and no fallback.

## Variable diagnoses

Inputs are caller-owned. They are not one frozen seven-case fixture. Quotes used here are `4.50`, `9`, `later`, and numeric `9`. Clock for the direct calls was `2026-10-12T00:00:00.000Z`. Deadline was `2099-01-01T00:00:00.000Z`.

| Input | Fit | Schema | Semantic | Next action |
| --- | --- | --- | --- | --- |
| GET `/estimate`, string schema, quote `4.50` | diagnosed | pass | pass, shape string | `decimal_match` |
| POST `/price`, string schema, quote `later` | diagnosed | pass | fail `value_mismatch`, shape string | `value_mismatch:data.quote:string` |
| required path `id`, quote `9` | diagnosed | `seller_response_required_path_missing:data.quote` | pass, shape string | `seller_response_required_path_missing:data.quote` |
| quote type `["string","null"]`, quote `9` | diagnosed | `type_not_guaranteed:data.quote` | pass, shape string | `type_not_guaranteed:data.quote` |
| enum `["9","later"]`, quote `9` | diagnosed | `enum_not_guaranteed:data.quote` | pass, shape string | `enum_not_guaranteed:data.quote` |
| string schema, quote number `9` | diagnosed | pass | fail `value_mismatch`, shape number | `value_mismatch:data.quote:number` |
| root `oneOf`, quote `9` | no_fit | `schema_unsupported` | pass, shape string | `schema_unsupported` |
| value omitted | missing_input | not_invoked | not_invoked | `missing_input:value` |
| schema `null`, quote `4.50` | diagnosed | `seller_response_contract_absent` | pass, shape string | `seller_response_contract_absent` |
| quote type `array`, value `["9"]` | diagnosed | `type_not_guaranteed:data.quote:array` | fail, shape object | `type_not_guaranteed:data.quote:array` |
| pointer `data.currency`, pattern `^[A-Z]{3}$` | no_fit | not_invoked | not_invoked | `no_fit:semantic_contract` |

A schema-correct quote is not treated as semantically correct. `later` and numeric `9` stay mismatches. A matching sample does not override a nullable, wider enum, missing required path, or unsupported combinator. `classifySchema` is unchanged: a nullable quote schema that still requires `quote` remains a schema pass there. The caller applies the owned decimal contract on top and does not rewrite that function.

`$ref`, `coldStart`, `shell`, a non-file path, a FIFO, a URL input, a stale pin, a wrong pin, a missing pin, an invalid deadline, and a past deadline refuse. Cost on every diagnostic is `{state:"unknown", amount:null, currency:null}`. `quoteGenerated`, `paymentSent`, `repairPosted`, `coldStartExecuted`, and `routeFetched` are false. `faithfulInvocation` and `completedUserTask` are false. `outsideAcceptance` is `not_observed`.

## Cold install and direct use

`npm pack --ignore-scripts` produced `samedaydesk-task-readiness-caller-0.1.0.tgz`, 4893 bytes, shasum `56f25c0460be6d874db9cc85446f90c1b407dd8e`. Entries are `package.json`, `lib/caller-readiness.mjs`, `lib/readiness-contract.mjs`, `lib/supplied-bounds.mjs`, and `task-readiness-caller.mjs`. The tarball does not contain `task-readiness.mjs`, `cold-client.mjs`, Express, or fixtures.

`npm install --offline --ignore-scripts --omit=dev` exit 0 in 224.716 ms. Hidden import of the installed pure module exit 0.

Installed CLI and the same installed `diagnoseCallerContract`:

| Case | CLI exit | CLI ms | Direct ms | Same decision | Next action |
| --- | --- | --- | --- | --- | --- |
| GET `/estimate`, quote `4.50` | 0 | 24.783 | 0.743 | true | `decimal_match` |
| POST `/price`, quote `later` | 1 | 23.512 | 0.183 | true | `value_mismatch:data.quote:string` |
| pointer `data.currency` | 1 | 23.585 | 0.050 | true | `no_fit:semantic_contract` |

The direct call is the same function. It keeps the no-fit path: the currency contract is not evaluated as a decimal and nothing is fetched. The CLI process is slower. `savingsClaim` is false. Unmeasured upkeep is not recorded as zero. Cold script total 829.177 ms.

## Child cleanup

The cold script and the tests use `spawnSync`. The cold temp directory was removed in `finally`. No `task-readiness-caller` process remained. L08 receipt JSON was restored with `git checkout --`.

## Root integration

Root owns merge and release. From current main:

```
git merge --no-ff 58b19a7d4e29caea8a56fede825bc616d430d873
```

That product commit is the callable seam. This receipt commit is the evidence and is not required for the module to run. Do not deploy, do not edit the human homepage, and do not register a paid route. No public readiness GET was required.
