# Heavy receiving plan: VF10 private visitor entry

Receive after VF09 and the existing VF04A owner. This source is not a prerequisite
for their work. Root owns activation; this plan makes no production env change,
migration, deployment, new login, external token issuance or financial commitment.

## 1. Receive only the owned module and verify exact source

Branch: `codex/visitor-entry-20260926` in `epistemedeus/neomorphic-io`.
Owned prefix: `scripts/visitor-foundry/entry/`. Assembled input head: `1dea574`.
It includes Neo `28924aac2a33cdf58bc9049a2198ab1ce9866f0f`, VF01
`5c38974c28c3c376f2cdd90a91c91e67eb7d00b5`, VF02
`47fe95ceaba28f6b87e9b4efc8b202b5ffaf1a5f`, VF03
`2689a197786cead5bcf3476f63aa14fe5da46d44`.

Read-only source inspection additionally fetched:

- VF04A F93 `107363a0fabaed6133235ebda812dd5f01b07d51`: CONTRACT,
  `wire/receiving-ports.json`, `src/extension.mjs`, `IntegrationStore.enroll`,
  `services/correspondence/src/visitor-foundry/boundary.ts` and service exports.
- VF05 `6324f34e2bab109b5babee7ceb9e147f114719ba`: session, VF02 port,
  VF04 proposed port, and receiving plan.
- SDS `8c7968360d64cc36f3b89486e01293c6553927cc`: actual
  `server/lib/correspondence-mount.js`, package and vendored service layout.

No other checkout was opened or edited; no shared source was changed. Fetches
added Git objects only. The later lifecycle/VF09 heads must be reviewed by their
existing owner, not replaced with the inspected F93 pin.

On a receiving branch, inspect the published feature tip before taking only the
owned path, or cherry-pick its module-only commits. Do not merge its assembled
parents over newer VF04A source:

```sh
git fetch origin codex/visitor-entry-20260926
git diff --name-only 1dea574..origin/codex/visitor-entry-20260926
git diff --stat 1dea574..origin/codex/visitor-entry-20260926
# Every changed file must be under scripts/visitor-foundry/entry/.
# Apply the reviewed module-only delta to the receiving branch.
```

The service imports intentionally resolve to the existing compiled correspondence
source. Rebuild the **receiving** service before tests. Test against the final
source; do not claim these old pins alone accept the final F93/lifecycle behavior.

## 2. Reproduce acceptance without touching shared runtime

From the Neo receiving checkout:

```sh
npm ci --prefix services/correspondence --ignore-scripts
npm run build --prefix services/correspondence
npm run build --prefix scripts/visitor-foundry/entry
npm test --prefix scripts/visitor-foundry/entry
node scripts/visitor-foundry/entry/tests/disposable-pg.mjs \
  --import ./services/correspondence/node_modules/tsx/dist/loader.mjs \
  --test --test-concurrency=1 services/correspondence/tests/*.test.ts
```

Use an existing PostgreSQL binary installation, default `/usr/lib/postgresql/16/bin`.
The runner fails if binaries are absent. It uses a temporary data/socket directory,
loopback random port, 32-connection cluster maximum and the current ordinary VM
user, then stops/removes the cluster. It does not consume host credentials.

The 19 entry cases use real Postgres and independent HTTP server/client processes;
the CLI sequence uses eight fresh processes. Fault cases exit the server after
real project/grant/complete-registration commits. Another case kills it after the
durable fixture receiver commits. SQL verifies project/grant/charge counts and
pending state, rather than accepting mocked call counters. Event uncertainty
injection wraps the actual store before and after its real commit; it is labeled
separately from process-death tests. Two independent hosts also contend on the
same installed budget. No missing-runtime skips are accepted.

## 3. Install an explicit finite profile, separately from mounting

The default example is 32 total enrollments, 32 distinct event intents per
workspace (failed/unknown outcomes retain their reservation), 3,600-second grants,
604,800-second workspace lifetime. Bounds are policy, not measured customer demand.
Choose a finite cohort within the host's actual resources. Budget cannot be raised
by restarting, changing its alias, rotating a secret, or repeatedly running install.
There is one immutable installation row per correspondence namespace. Never delete
it or its charged registrations to simulate renewal or recycle capacity.

For an authorized receiving **disposable/staging** database, use the existing base
migration first. These commands are also the exact production sequence for Root
if later authorized; no production command was run in this assignment:

```sh
# Existing environment supplies the database/admin configuration; do not print it.
node services/correspondence/dist/migrate.js
VF10_DATABASE_URL="$CORRESPONDENCE_DATABASE_URL" \
  node scripts/visitor-foundry/entry/migrate.mjs \
  scripts/visitor-foundry/entry/installed-profile.example.json
```

The example explicitly names `pilot_correspondence`, as required by SDS. For an
isolated test schema, prepare a reviewed profile JSON with that schema. The entry
migration creates only its three tables in the existing namespace; it requires
the already-existing correspondence project table. It is rerunnable. It never
installs VF02/VF04, starts a runner, or mints an external fixture token.

The migration CLI deliberately installs only `receiver:null`. An internal receiver
requires a separate reviewed host installation using `EntryStore.install()` with
that exact port ID present. It cannot silently replace a disabled installation.
Do not implement public operator, enroll, grant-management or budget-edit routes.

For shutdown/rollback of public availability, disable the entry route and preserve
all tables/charges. Grants remain valid until their finite expiry or host revocation;
if immediate shutdown is required, revoke the enrolled reader/writer grant IDs
through trusted `PostgresStore.revokeGrant`, then disable routing. Never replace the
bounded app with a raw app while visitor grants remain active: that would remove
the event cap. There is intentionally no destructive down script that resets budget
or cascades correspondence data. Data-retention/deletion is a separate host decision.

## 4. Bind the actual SDS mount and lifecycle

The pinned SDS function `mountCorrespondence` already loads
`@neomorphic/correspondence`, calls `loadConfig`, creates the PG store, assigns
`state.app = service.createApp(store, config)`, and dispatches under
`/api/correspondence`. It closes `state.store` on startup failure and shutdown.
Unconfigured/invalid/store-unavailable states use the existing disabled router;
it must continue to leave all other SDS routes running. This is the receiving host,
not an invitation to start another server or change the platform.

The minimal receiving change inside `tryEnable`, after `state.store = store`, is
conceptually this exact exported adapter call (import path depends on reviewed
vendoring below):

```js
const entryMount = createEntryMount({
  enabled: true,                         // explicit installed host choice
  databaseUrl: config.databaseUrl,
  schema: config.pgSchema,
  correspondence: store,
  config,
  receiver: null,                        // v1 private correspondence only
  poolMax: 2,
});
await entryMount.checkReady();           // no implicit migration or installation
state.app = entryMount.app;
state.entryMount = entryMount;           // add to state and cleanup paths
```

Keep the original `service.createApp` branch when entry is not selected **and no
active visitor grants exist**. In both startup-failure and `close()` paths, close
`state.entryMount` before `state.store`, clear both references, and preserve SDS's
`state.closed` race handling and bounded one-time store retry. If readiness fails
before assignment, close the local `entryMount` in a local finally/catch to avoid
leaking its pool. Do not declare the entire service ready until entry readiness
passes when entry is selected. Base `/healthz` checks base storage; SDS startup
must additionally call this entry readiness function.

Retain existing trust-proxy/CORS/body/rate configuration. The public entry body is
small, with no VF04 512KiB maximum-domain payload need. Do not raise body limits
solely for this module. Keep header/body logging disabled/redacted in the existing
proxy, APM and access-log policy; module code itself logs no secrets. Configure the
aggregate PG connection budget: source tests use base=1, entry=2; adding existing
VF02/VF04 pools is an additional explicit host allocation, not free capacity.

The module has repo-relative imports into one correspondence implementation.
SDS currently vendors that service at `vendor/neomorphic-correspondence`; it does
not ship the Neo scripts tree or safe-file CLI helpers. Avoid accidentally loading
two copies of `ApiError`/store code, which would break error identity/handling.
A concrete packaging option preserving one canonical service is:

```sh
# Run in the receiving SDS checkout only after reviewing source pins.
# NEO_RECEIVING is an absolute path to the accepted Neo receiving checkout.
mkdir -p vendor/neomorphic-foundry/scripts/visitor-foundry
mkdir -p vendor/neomorphic-foundry/services
cp -R "$NEO_RECEIVING/scripts/visitor-foundry/entry" \
  vendor/neomorphic-foundry/scripts/visitor-foundry/entry
ln -s ../../neomorphic-correspondence \
  vendor/neomorphic-foundry/services/correspondence
```

The symlink command assumes a new reviewed destination; do not overwrite an
existing layout. Node's canonical module resolution must point the entry imports
and SDS service import to the same vendored service bytes. If deployment packaging
cannot retain symlinks, Heavy should add a small build-time dependency adapter
instead and test equivalent single-module identity. Refresh the canonical vendored
service from accepted receiving source through the existing vendor workflow, not
by copying this branch's older shared files. Server entry needs only entry
source/migration and correspondence; the local CLI remains in Neo. To vendor the
CLI too, additionally include `scripts/correspondence/` and the service's
`bin/safe-io.mjs` in their expected layout; those are absent from the pinned SDS
vendor. Pin a source manifest for every copied file.

At the SDS root the reviewed entry migration command then becomes:

```sh
npm run correspondence:migrate
VF10_DATABASE_URL="$CORRESPONDENCE_DATABASE_URL" \
  node vendor/neomorphic-foundry/scripts/visitor-foundry/entry/migrate.mjs \
  vendor/neomorphic-foundry/scripts/visitor-foundry/entry/installed-profile.example.json
npm run test:correspondence-mount
```

Add receiving tests for the real SDS disabled/startup/close/retry behavior with the
entry pool, plus prefixed cold registration/recovery, role/tenant checks, finite
exhaustion, no credentials in URLs/logs, and expiry/revocation. This branch tests
the actual correspondence Express app under the exact prefix; it **does not** claim
SDS startup tests or that vendor packaging ran. The pinned SDS source was read only.

## 5. VF04A final binding: required, not silently implemented

At F93, `IntegrationStore.enroll(projectId, frozenExperiment, options)` requires
`purpose:'owner_qa'`, frozen cases, the exact baseline source digest, and immutable
pool configuration. It inserts the VF04 pool and experiment transactionally.
There is no public enrollment HTTP route and no exported exact enrollment
readback. Do not pass arbitrary visitor inputs or call that fixture port as if it
were general public signup. Do not instantiate another receiver or scheduler.

The existing VF04A owner must first provide/review a final internal binding with:

1. One installed, nonfinancial, exact receiver contract ID and frozen configuration.
   It must reserve from a finite **aggregate host/cohort** execution/admission
   budget before authorizing execution. Multiplying per-project pools by up to
   `maxEnrollments` is a real resource allocation; account for that total.
2. `begin({registrationId,projectId,signal})` tied to the already-charged VF10 row,
   with installed capabilities, policy/evaluator pins, scope, actor and budget
   supplied by the host. No public funding, runner, source-sharing or limits.
3. `read` proving project + registration + installed config/version + exact budget
   reservation are bound. It must distinguish pending/unknown/ready/declined from
   table absence. A bare pool row or a successful mock invocation is not proof.
4. The once-only begin marker stays authoritative. An unknown or timed-out begin
   must not be invoked again automatically. A crash before begin can remain unknown;
   VF04's authoritative recovery must finish or decline it without repeating an
   unknown mutation. Grant recovery still supplies usable private correspondence.
5. Real disposable PG conformance tests kill processes before/after each receiving
   commit, exceed total host capacity, vary aliases, race exact attempts, restart,
   revoke grants and prove readback. Fixture receiver tests here are only protocol QA.

V1 scope deliberately rejects public work-cell/foundry routes even if an internal
port reports ready. A future contribution-enabled profile requires a reviewed
versioned profile/terms change plus bounded VF02 cell/command and VF04 admission
limits, and a tested scope gate. Do not remove that gate merely because a pool is
present. One v1 installation cannot be silently relabeled as a new cohort with a
fresh budget. Plan host-authorized migration preserving existing aggregate charges
and old exact terms, or retain v1 as private-only and admit the new scope separately
under an explicit remaining host budget.

## 6. VF05 binding and original-use behavior

VF05 `ParticipationSession` takes `binding:{origin,tenantId,grantFingerprint}`,
`identityKey`, a port and `currentTerms`. Its `vf02Port` uses actual project-grant
HTTP commands, while its `vf04Port` is explicitly a proposed host-method port.
It does not currently perform public enrollment. Keep that separation.

Once the final contribution-enabled scope above exists:

- Discover the public descriptor without identity proof. Compare `profileId` and
  exact `termsHash` against the caller's standing unattended authority. Decline or
  exhaustion must preserve the original host response/task, not turn failure into
  consent or instruct the caller to ask our operator for a token.
- Use VF10 `prepare`/`continueEntry` to persist proof and exact attempt before POST.
  Keep its private secret separate from VF05's secret-free sidecar and hint.
  Bind `tenantId` to the received `projectId`, origin to the prefixed canonical
  base URL, and fingerprint to the recovered writer grant using VF05's existing
  fingerprint convention. Never infer identity independence from these IDs.
- Keep VF05 `identityKey` separately stored or explicitly purpose-separated using
  maintained crypto. Do not reuse bearer strings as public semantic identities.
  V1 entry's immutable profile terms and VF05 contribution terms are different
  authority objects: the receiving adapter must bind both, not merely rename the
  hashes or accept shape compatibility as authorization.
- Only then construct `vf02Port({baseUrl,projectId,token})` in memory. Preserve exact
  requestId/terms/revision/fence/receipt binding and persist-before-send semantics.
  Returning VF05 hints remain read-only; do not generate a new mutation from a hint.
  On grant expiry use the same-registration refresh; on revocation/deadline stop
  and continue the original task. Never create aliases to bypass a refusal.
- Consume the final F93 wire: full capability coordinates/content pins,
  `gap-binding.v1` and explicit `cellGap` projection. The older VF02 digest-valued
  gap revision is not the same shape as the immutable VF01 revision=1/contentId
  contract. The receiving owner, not VF10, must perform the tested lossless mapping.
- Preserve private reproducers and explicit synthetic/authorized reusable scope.
  Registration by itself grants no sharing consent, candidate acceptance, verifier
  identity, publication, invocation result, payment or independence assertion.

A receiving end-to-end case must enter cold, use real VF02 claim/checkpoint and
final VF04 admission within aggregate limits, lose/reconcile replies, restart,
resume from private local continuation, and preserve the original task on decline.
This branch's delivered cold operation is genuine correspondence, expressly allowed
by VF10 acceptance; it does not claim that future combined journey is already run.

## 7. Release and evidence boundary

Review CONTRACT, RESULT and `evidence/acceptance.json` alongside the exact feature
head. Evidence is owner-controlled QA, not external signup or useful customer reuse.
Latency/bytes are one local-HTTP VM trial; the load uses independent HTTP clients
in the parent process, with separate server processes, not 128 independent agents.
One/8/32/128 offers measure entry admission only; they do not measure resolver,
verification, publication, invocation or hosted TLS behavior.

Root can receive this source now with receiver disabled. Root alone decides when
actual host env/database activation and any external experiment are appropriate.
No main merge or production change was performed here.
