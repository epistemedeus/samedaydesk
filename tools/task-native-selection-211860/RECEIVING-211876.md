# Receiving 211876

Successor receipt for `codex/task-native-cold-receiving-211876`. Source identity stays `codex/task-native-selection-211860`. `RECEIVING.md`, `acquired/`, and `receipts/` are the 211860 snapshots and are unchanged.

Received source: `aced5b48c9192afc74d6d3119ce104e529d8a64e`, tree `5120a1f766b82aaea2529819a4eca4975586379b`, base `d760714c932fd317e1435b528575fecd95594183`. Correction commit before this receipt: `1eb288119af9125feb5a45a9b90e3ae09a3fc12d`. Package version `0.1.1`.

## First failure

`node --test --test-concurrency=1 test/guarantee.test.mjs` on the received source exited 1. 8 tests, 0 pass, 8 fail.

The first assertion was `supportsOutput` on a required `title` of type `["string", "null"]` for a caller type `string`: actual `ok: true`, expected `false`. The same run then showed a wider producer enum accepted (`true !== false`), a EUR `0.10` quote selected over a USD `0.50` quote (`selected` rather than `unranked`), a known-free caller quote stamped `USD` when currency was omitted, the acquired careers `location` field reported `output_supported` for a string-only item constraint, a EUR display price still emitted a USD measurement, and the synthetic loopback left `method` undefined for a POST entry.

## Correction

`requiredOutput` is an allowed output set. A producer demonstrates it only when every type and enum value it may emit stays inside that set. `anyOf` and the other combinators listed in `src/schema-support.mjs` return `schema_unsupported`. Integer is not treated as number. `meaningId` is recorded as `task_label` with `semanticEquivalence: false`.

Positive amounts compare as exact decimal strings only when the currency code matches `^[A-Z]{3}$`. A caller quote with an amount and no currency is `undenominated`. Different currencies, unknown prices, and undenominated quotes stay in `alternatives` with `economicComparison: unresolved` and `impliedCheapest: false`. Known free remains a strong direct alternative. This is not a payment gate.

`execute-synthetic` sends the declared method and labels the result `fixture: response_schema`, `faithfulInvocation: false`.

## Replay

From `tools/task-native-selection-211860` on Node 22, after the correction.

| Command | Exit |
| --- | --- |
| `node --test --test-concurrency=1 test/*.test.mjs` | 0 (29 pass, 0 fail). The previous 21 tests are in this run. The unknown-versus-denominated case now expects `unranked`. |
| `node ./scripts/cold-receive-211876.mjs` | 0 |

Cold temp install of `samedaydesk-task-native-selection-211860-0.1.1.tgz` (112106 bytes): pack 0, install 0, child 0, install 610 ms, total 1178 ms. The child consumed the packed acquired catalog and the packed task files.

Fresh anonymous GET `https://samedaydesk.com/discovery/task-readiness.json`: status 200, one hop, 3408 bytes, 173 ms, sha256 `5139834edf36fca8ee39204c106e56f0423267e98a9efbfb9a464393c9ec9c80`, identical to `acquired/sources/task-readiness.json`. `validateInstance` against the snapshot discovery schema returned `instance_valid`. The readiness paths returned `output_supported`. `paid` is false and `invokesPricedExecution` is false. `coldStart` was not executed. The retained copy is `receiving-211876/task-readiness.json`.

## Stages

Readiness document task, on the retained catalog: query accepted, render rendered, selected `discovery:task-readiness`, executed `not_executed`, useful acceptance `not_observed`. `economicComparison` is `known_free`. `impliedCheapest` is false. The snapshot still shows currency `USD` because that file was normalized by 0.1.0. The corrected normalizer does not invent a currency for a discovery document. The local command stayed `not_run`. This validates the discovery document only. It does not validate the unexecuted downstream command.

No-fit flight task: query accepted, render rendered, selected `no_fit`, executed `not_executed`, useful acceptance `not_observed`. `meaningId` `booked-seat` stayed a label.

Direct-free alternative with the same discovery schema and a known-free price and no currency: selected `caller:readiness-direct`, `economicComparison` `known_free`, currency null, `impliedCheapest` false. The owned discovery entry stayed eligible as `same_known_free_class`.

Mutations of the acquired contracts: extract `title` moved from `output_supported` to `type_not_guaranteed:title` when changed to string or null. Referral `recheck.decision` moved from `output_supported` to `enum_not_guaranteed:recheck.decision` when an extra enum value was added. USD `0.005` beside EUR `0.001` stayed `unranked`, alternatives `eur-extract` and `usd-extract`, `impliedCheapest` false.

Controls on the acquired extract contract: expired, stale, changed, and absent output schema were all ineligible.

Same-equipped effort on the readiness task, owner QA, `savingsClaim` false: plain catalog list 0.077 ms and selected nothing; direct contract walk 0.208 ms with `economicWinner` null; direct document validation 0.012 ms and ok; selector 0.387 ms. Stages matched the readiness selection. These durations are not customer time.

## Do not treat as

Customer revenue, useful acceptance, autonomous external use, or a cheapest offer. Banked 10.955 USDC is unchanged. No paid route was called. No shared catalog, root package, or public page was edited.
