# Lifecycle 100517 / concurrent installer receiving 100520

Same native session `01a10c36-95c6-7d81-ba6c-edd7587eb57f`, one writer on `codex/sol-host-lifecycle-100517`, [PR285](https://github.com/epistemedeus/samedaydesk/pull/285). Correction base: Root's exact `6e901035597bfa46ece12de072a7ae3880703da8`. The full unmerged `e82ef4be220db3b145e592650f1d3ea6d5075f17` lifecycle package is retained. Resolve the exact export with `git rev-parse HEAD` on this PR branch; the pushed head is also in the PR receipt. No production credentials, authority tree, SQL, hosting operation or human page was accessed or changed.

**Cause.** Root's independent run remains213/214, with an untyped installer exit1. Bounded disposable-only capture independently reproduced the same concurrent CLI control: `40P01`, phase `entry_migration`. Entry's combined migration executes001's registration ALTER before002's installation ALTER. Canonical receiving holds installation, then counts registrations. Real PostgreSQL lock observation proves the cycle: migration holds registrations `AccessExclusiveLock` while waiting for installation; receiving holds installation while waiting to read registrations. Root's discarded stderr does not record its exact SQLSTATE. PostgreSQL documents this [lock-order deadlock mechanism](https://www.postgresql.org/docs/16/explicit-locking.html#LOCKING-DEADLOCKS) and [40P01](https://www.postgresql.org/docs/16/errcodes-appendix.html).

**Repair.** Six lines in `entry/src/store.mjs::migrate` acquire the existing installation table's strongest required lock first, in the same transaction/schema, before either original migration file. Fresh creation retains the existing transaction-scoped migration advisory lock. Commit/rollback release it. No migration SQL, authority, history, runtime, budget or retry changes; no daemon/session lock. Private profiles/runtime finish before this identified SQL failure. Production `runBounded` still drains/discards stderr. Test-only diagnostics emit typed codes/phase enums and require loopback disposable `generation_<32hex>` storage. Concurrency controls await both children before teardown.

**Final validation:215 pass,0 fail/skip/cancel, exits0:** generation20 under official Node22.14.0 `/exec-daemon/node`, against distinct official Node22.18.0 `/tmp/root-sol-100503/node-v22.18.0-linux-x64/bin/node`; private-pass30, serving/managed/security135, copied managed-runtime5 and wire25 under22.18.0. Owning `npm ci` exits0 with unchanged locks. Two independent50-pair fresh concurrent runs each return exactly one original and one replay of the same receipt, preserving full authority/charged/caps snapshots. Forced canonical migration/receiving interleaving makes exact6e source fail40P01; corrected source waits before locking registrations, both operations succeed, then installer replay returns the same receipt. Populated refusal, expected-old conflict and injected receipt rollback pass. Lifecycle expiry/renewal/lineage, lost replies, copied cold managed HTTP serving/restart, separate visitor reuse, enforced limits/cancellation and current verification closure remain green on disposable PG. VM controls establish no actual hosting acceptance.

Exact commands/counts/exits, log/evidence hashes, forced lock readback and Node binary hashes: `concurrency-receipt.json`. Original `receipt.json` is unchanged; original report is `RESULT-e82ef4be.md`. Root's failure and diagnostic-hook logs remain in `/tmp`; the hook error is not another lifecycle verdict. Twelve initial concurrent controls and an initial full suite passed before repeated controls exposed the race. One builder run overlapped `npm ci` and failed module loading before tests; its retained log establishes no source failure.

Changed files: canonical entry store; appended SOURCE-PIN amendment; private control hashes/exact predecessor closure; generation control/two disposable fixtures; receiving reports/receipt. SOURCE-PIN SHA256 `aae0fabc68814bc83b7b17f246d06d52e9c0741a9b76d64e7fa25e9a0c02d53f`; control closure `sha256:f22a99ccfc482e317bbf862d63b48789072273690697f11c6a4c7d2dac3f0b18`. Prior amendments and sealed PROFILE/interpreter/binding/native/launcher/execution bytes remain intact. Runtime pin remains `sha256:f332a87cc95f2f02da587e654748e2da1449181c84c76150acafd60831a2d1b9`. Source receiving renews no installed execution authority.

## Root: original A continuation

The concurrency correction needs **no production installer/migration/unconsumed transition** for original A's populated cohort. Root receives source and deploys ordinary named `build:managed-foundry`, preserving all16 values, opt-in, private profiles and verified `CORRESPONDENCE_PGSSL_CA_FILE`. No multiline PEM resave or full-replacement environment PUT.

```sh
umask 077
owner_config=/absolute/path/to/existing-owner-config.json
visitor_config=/absolute/path/to/existing-visitor-a.config.json
node vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry/visitor.mjs renew "$visitor_config" --json-result
node server/foundry/activation/remote-private-journey.mjs a-prepare-continuation "$owner_config"
```

Read-only preparation seals separate0600 `owner-original-a-{renew,dispatch,receive}-100517.json` requests in the existing caller directory. Check project `prj_5cboYklXAf5S8Gio`, registration `ven_LN-0OoD1GHnf_iur`, task `task:owner-a-use-useful`, manifest `sha256:d881fa10fdab79d92d4c496a6f1446aeb832163641438e68395eec4c30aa1e7c`. Remaining exact nonsecret binding/typed contracts remain in `RESULT-e82ef4be.md`. Original intent is never overwritten.

Root selects **three separate** named `build:managed-foundry-private-pass` builds, supplying each exact request through `FOUNDRY_PRIVATE_PASS_JSON` or existing private-file adapter: (1) `renew-evidence`, exact1→2 expiry receipt/no launch/refund; (2) `dispatch`, accepted/published2, four real exited/drained0 executions, outstandingPhysical0, validation4000→8000; (3) v3 `receive-no-launch`, exact predecessor/successor and original proof, invocation charges1→2 under original caps, no launch/refund. Lost replies reuse exact journals/readback; unknown physical work stays held for canonical explicit reconciliation. Expired successor evidence refuses. Restore ordinary build selection and remove only maintenance inputs.

```sh
node server/foundry/activation/remote-private-journey.mjs a-reconcile-invocation "$owner_config"
node server/foundry/activation/remote-private-journey.mjs a-use "$owner_config"
node vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry/visitor.mjs status "$visitor_config" --json-result
# Root performs and attests the actual HTTP restart before B.
node server/foundry/activation/remote-private-journey.mjs b-use "$owner_config"
node server/foundry/activation/remote-private-journey.mjs check "$owner_config" /absolute/path/to/private-canonical-readbacks.json
```

Require canonical exited/drained execution, exact successor manifest/task/runtime/current verification;409/no-launch/unknown remains failure. Later B after evidence expiry requires explicit original-budget `renew-evidence` and `dispatch`, then its own current manifest. Workspace/grant renewal extends no capability lifetime. Actual original-A launch, Hostinger restart/B and outside adoption remain Root's unaccepted gates. No merge or deployment is included.
