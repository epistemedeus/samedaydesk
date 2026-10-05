# Private allocation receiving and execution generations

This is operator maintenance of the same `pilot_correspondence` enrollment. It never rolls over a namespace, refills a budget, creates another verification database, or activates serving. Human pages and the product data service remain outside this operation.

`entry-host-profile.v2` and `entry-receiver-binding.v2` bind allocation, evaluator suite, contribution permission, sharing, aggregate budgets and physical ceilings. Their explicit `executionAuthority: current-installed-verification-generation-required` separates consent/allocation from actual execution. Node, Python, Wasmtime, launcher, worker and source pins still bind each installed pool verification, assignment, observation and invocation. An installer replay can succeed while old evidence is unusable; it is installation readback, not renewed verification. Changed evaluator suite/authority/caps still fail immutable allocation checks.

## Existing unconsumed v1 enrollment

Ordinary `foundry:install`, startup and `build:managed-foundry` do not convert v1. Inspect privately, using the existing authorized independent database and original private files/CA:

```sh
npm run foundry:installation
```

Inspection performs no SQL migrations or authority writes. With installer-only inline inputs it can materialize their private files through the existing no-overwrite adapter. Output includes the actual stored `hostConfigId`, `entryTermsHash`, `originalTermsHash`, charged/maxEnrollments, registration/admission/pool counts, maxAdmissions/maxPhysical and desired allocation identity. Never guess these hashes from the receiving VM's current execution pins.

Root retains the stored old hashes as the expected identities, independently confirms that **charged=0, registrations=0, admissions=0, pools=0**, and selects this explicit action on the destination host:

```sh
FOUNDRY_RECEIVE_EXPECTED_HOST_CONFIG_ID='sha256:<stored old host hash>' \
FOUNDRY_RECEIVE_EXPECTED_ENTRY_TERMS_HASH='sha256:<stored old active terms hash>' \
npm run foundry:receive
```

The command is `node server/foundry/install.mjs --migrate --install --receive-unconsumed`. It requires both well-formed expected hashes before opening the database. The transaction locks the existing entry installation and host allocation, verifies the entire canonical old body and active contribution profile, and refuses any changed allocation/authority or nonzero work. Entry registration reserves under the same installation lock. It updates only active contribution profile and host config, retains the original profile/terms/charge/caps, stores the full previous installation/host/profile in `correspondence_vf12_allocation_receipts`, then reads back all three within that transaction. Its recorded execution observation is provenance, **not trusted verification evidence**. Exact lost-response replay returns that same receipt after checking the current binding; it does not rerun a transition or overwrite its history, including after later admissions.

On Hostinger, `build_script` is a package script **name**. Root can first select `build:managed-foundry-inspect`, then explicitly select `build:managed-foundry-receive` with both expected-hash keys added individually in hPanel. The latter runs the normal build/probe followed by `foundry:receive`. Keep `FOUNDRY_HOST_OPT_IN` off. Keep the original independent database, original profiles/key and official CA with verify-full, all sixteen preexisting environment values, and existing maxEnrollments12/maxAdmissions4/maxPhysical1. Do not use a full-replacement environment PUT or the obsolete fifteen-key backup. After atomic receiving readback, run `npm run foundry:install` once as ordinary replay on that destination; compare terms/config/caps/charge to receiving readback. Restore the normal build name and remove the expected-hash keys and installer-only inline values. Serving needs the established private file paths, not inline secrets.

`receiving_identity_conflict`, `receiving_authority_conflict`, or `receiving_populated_cohort_requires_reconciliation` means HOLD. A populated legacy v1 cohort is **not supported by this conversion**: even a charged registration with no project/admission blocks it. Its visitors signed runtime-bound terms. Retain its original records/runtime and reconcile its existing work explicitly; do not apply v2 pool renewal as if it converted those terms. A populated legacy consent-preserving conversion needs a separately reviewed operator/visitor reconciliation contract. No such conversion is claimed here.

## Subsequent populated v2 runtime changes

Before a deployment, quiesce admissions/execution in the old process and finish or explicitly reconcile every admitted physical job under its original runtime, with owned-process exit/drain evidence. Retain old runtime bytes until that work is settled. Nothing here silently cancels/replays it. `configureVerification` refuses a changed generation while any pool attempt is unreconciled or invocation is incomplete.

After the new runtime/probe passes, private inspection is:

```sh
npm run foundry:generation -- --inspect
```

It lists bounded pool/candidate identities, current verification ID/revision/validity, whether it matches the actual installation, and outstanding physical count. Startup remains fail-closed while a pool verification is stale. Existing visitor registration/grants/private correspondence and stable consent terms remain the same.

Root supplies a private `0600` request file outside repo/public/deployment output, with this exact shape (IDs come from inspection; keys identify one durable intent):

```json
{
  "projectId": "<existing project>",
  "expectedVerificationId": "sha256:<stored verification>",
  "revision": "vf09:<explicit new revision>",
  "validityMs": 3600000,
  "key": "<unique maintenance intent key>",
  "candidates": [{
    "candidateId": "<existing candidate>",
    "expectedGeneration": 1,
    "key": "<unique revalidation intent key>",
    "reason": "verification_changed"
  }]
}
```

```sh
FOUNDRY_GENERATION_REQUEST_FILE=/secure/generation-request.json \
npm run foundry:generation -- --apply
```

For a destination managed build Root can select the named `build:managed-foundry-generation` after securely providing that file. This is an explicit maintenance build, never an ordinary build. Apply per enrolled pool, including consumer pools whose runtime changed. This adapter uses existing `configureVerification` and `requestRevalidation` journals/expected identities. Each existing maintenance transaction is atomic; the whole list is not one transaction. Partial failure requires the **same file/keys** replay, not a new candidate or enrollment. A historical maintenance replay from an earlier runtime fails current installed-policy validation. No evidence is executed or published by this command. Old observations are retired without deleting old attempts/publications/invocations. Revalidation consumes remaining original charged validation budget; at most four candidate generations are supported. Exhausted budgets/generations stay exhausted.

Then the existing private operator ports perform fresh execution and publication on the actual host:

```sh
FOUNDRY_HOST_OPT_IN=1 npm run foundry:worker -- dispatch '<existing project>'
```

Dispatch's existing `recoverPool` calls `IntegrationStore.publish(projectId,candidateId,generation)` for the current pending publication only after completed verification. Publication is absent from HTTP. Reinspect all pools for `installedVerificationMatches:true` and `outstandingPhysical:0`. Restore ordinary build settings and remove maintenance-only input paths. Root can now separately opt serving in and restart `npm start`, perform visitor A contribution/actual verification/publication/use, restart the actual HTTP app without any installer, then perform visitor B registration and canonical acquisition/invocation of A's same candidate. Include useful negative and changed input refusal, distinct observations, exited/drained workers and retained private correspondence. Run `foundry:accept` with source-bound task/durable readback; health alone cannot establish those facts. These commands do not themselves constitute activation or outside adoption.

The lock ordering uses PostgreSQL transaction-held row locks: [official explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html). Node22.18.0 receiving uses [the official release](https://nodejs.org/en/blog/release/v22.18.0). Host controls remain as documented by the [official SDK](https://github.com/hostinger/api-python-sdk/blob/main/docs/HostingV1NodeJsUpdateBuildSettingsRequest.md) and [individual hPanel env edits](https://www.hostinger.com/support/how-to-edit-or-add-environment-variables-after-deployment/). Cursor tests establish receiving only; Root owns all actual database/Hostinger operations and actual-host visitor proof.
