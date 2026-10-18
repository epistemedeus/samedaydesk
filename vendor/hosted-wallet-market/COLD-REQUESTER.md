# Unfunded machine entry: operator release contract

The account/kernel, requester market and payment authority remain their existing consumers. `examples/GUIDE.md` is the ordinary agent path; `examples/OPERATOR-TESTS.md` is disposable QA. No human page or frozen client is changed.

The installed predecessor is SDS `3009b83c9626f323719b590113e80cb7574fab59`, Hostinger build `01a14ef9-9db9-72e6-9029-b04dbc563424`. Its source hash is `9b2a778e1847482819b02205c376010d9c31e85f1bb555826106e4c9f8da8f05`; its host closure is `7bdfb762a15d74af9171c4dd0f21007b301f331efa6bc45bf073ddd893888b4a`. `SOURCE.json` retains that original pin. Compute candidate identity from the exact candidate bytes with `installedSourceSha256()` and `hostSourceSha256(SDS_ROOT)`, never by relabeling the retained pin.

Use the accepted Pilot `26ee48591edccb2390411dffac3d4574ca1e6eb7` controller without substituting this candidate's validator under its `tools/root71-hosted-wallet-market` import. Its qualification staging contains 501 source files, including 32 declared nested dependency members, plus the compatible top-level installed dependencies. This signing closure does not contain the complete wallet package. Capability generation and packet preparation require the full exact SDS checkout, private-control pin, wallet `src`, `bin`, `schema`, `contracts`, `client`, all prebuilt `runtime` files and top-level installed dependencies. Use a separate signing stage and complete SDS tree.

First prepare/build/qualify/activate the candidate with the existing wallet environment, capability absent. `installed-debt.mjs prepare-release` preserves those old wallet values and prepares only the disabled rollout packet. The canonical controller refuses an early new `HOSTED_WALLET_MARKET_MACHINE_PROFILE` addition. Do not weaken that check. Receive a completed build bound to the candidate SDS commit, original-account/claim/terms/debt/paid proof and the new source qualification through the canonical lifecycle before adding the entry.

Before interpreting the old paid disposition under the new package, use the original authenticated owner and a fresh enrollment operation to append the existing source-succession edge. Retain the enrollment row, original consent and paid observations; never resubmit the discharge payment. Receive the paid and unpaid joins again. The existing `enroll` operation derives the successor hashes from the running source and refuses changed owner/profile/registry authority.

Then capture the complete current full-value qualified environment into a new mode `0600` file. Generate a source-bound document on the complete exact candidate tree (the output parent must already exist):

```sh
node "$SDS_TREE/vendor/hosted-wallet-market/bin/machine-profile.mjs" \
  --sds-root "$SDS_TREE" --origin "$ORIGIN" --tenant "$TENANT" \
  --money unfunded --out "$PRIVATE_DIR/capability.json" > "$PRIVATE_DIR/capability-output.json"
export HOSTED_WALLET_MARKET_MACHINE_PROFILE="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).sourceBound' "$PRIVATE_DIR/capability-output.json")"
node "$SDS_TREE/vendor/hosted-wallet-market/bin/installed-debt.mjs" prepare-machine-entry \
  --manifest "$MANIFEST" --input "$CURRENT_QUALIFIED_ENV" \
  --sds-root "$SDS_TREE" --output "$PRIVATE_DIR/entry-packet"
```

The packet has a complete install, exact current rollback and a source-bound receipt with `sent: false`, `qualified: false`. Only the machine profile can be added. Origin, tenant, both source hashes and qualified-source shape are checked through the same admission as runtime. Unfunded entry refuses any money-authority module. No signer, payment flag or funding authority is created. Relative mode `0600` regular files inside the installation remain supported; inline `source-bound:` avoids transporting a VM-local file path into a provider build. An unbound absolute path remains the legacy `path-unopened` release form, explicitly not a source-accepted capability. Relative paths and inline documents require the SDS root.

Root alone sends this separate entry packet through its configured provider transport after the canonical qualification lifecycle finishes, restarts the same completed candidate, then receives profile/discovery and a bounded real cold signup/post/interest canary. Preserve the pre-entry qualified environment for entry rollback and retain a fresh full-value readback. Do not insert the entry packet into an already prepared canonical operation; that operation intentionally checks its unchanged environment. Any later canonical operation must use its own fresh complete baseline. Source-only tests do not establish live qualification or public availability.

`funnel` reads the existing account operations, task, interest, transition and discovery tables in a read-only transaction. It creates no metrics store:

```sh
node "$SDS_TREE/vendor/hosted-wallet-market/bin/installed-debt.mjs" funnel --exclude "$PRIVATE_EXCLUSIONS"
```

Supply the existing verify-full database URL, earned schema and tenant through their ordinary environment. Exclusions accept private `accountIds`, `taskIds`, `operationIds` (at most 64 each); accounts and signup operations suppress their linked listings and listing observations, and post operations suppress their listing. Interest-operation exclusions suppress their retained interest observation. Filtering never deletes or reclassifies rows. Signups are scoped to the earned schema; listings to the configured tenant. Cohort/acquisition remain unknown; per-listing impressions are not unique agents. A funding row alone leaves settled paid work unknown. The 5% new-funded-market fee and old obligations/terms stay unchanged.

Entry rollback restores `entry-packet/rollback.json` through the configured transport and restarts the same candidate. This closes profile/discovery and retains accounts, listings, interests, transitions and financial rows. It does not restore the old binary.

Code rollback is a separate exact deployment of SDS `3009b83c9626f323719b590113e80cb7574fab59`, using its retained source-qualified environment and predecessor build receipt `01a14ef9-9db9-72e6-9029-b04dbc563424`. Restore the captured main linkage/auto-deploy setting and receive the actual selected/serving source and original business joins. Never describe an environment PUT as restoring code. Do not run down migrations, truncate/delete rows, rotate retained secrets, rewrite old fee/terms or initiate another payment. If only the entry is failing, entry rollback is the smaller independent action.
