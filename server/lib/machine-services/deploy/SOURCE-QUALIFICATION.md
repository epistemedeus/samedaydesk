# Composed source receiving, 243001

The previous export `1a55f55807e4cfef04dde3252619cdcbae0716dc` reproduces
Actions Runtime startup run [38707454771](https://github.com/epistemedeus/samedaydesk/actions/runs/38707454771):
`npm run test:proxy-addr` passes 5/7 and refuses both caller checks with
`caller_source_changed`. The predecessor manifest is retained verbatim in
`test/fixtures/caller-predecessor.json`; it is a refusal fixture, not current
authority. Its 548 members and 20 received descriptors are all retained.

The owning workflow is the existing foundry activation guide's “Receiving a
changed private caller runtime” procedure. The verifier remains
`server/foundry/activation/remote-private-journey.mjs`; no runtime hash check,
caller receipt check, budget or authority refusal was weakened. The pin's base
is the reviewed source before the manifest update. CI verifies the checked-in
manifest; it does not regenerate expected hashes from whatever CI happens to
contain.

Thirteen previously bound members differed: the two root package files,
`server/app.js`, `server/index.js`, seven opportunity source/compiled members and
the opportunity source pin/manifest. The nine opportunity differences belong to
the previously received original-holder continuation overlay, not the machine
service integration. The exact changed names, before/after hashes and originating
commits are in `test/evidence/qualification/before.json`.

The existing producer at Neomorphic
`872c4f3006db6c70b45d124480cd019e0af50e69` was cloned cleanly under this owner's
root, installed and built on this Cursor VM under the shared build lock:

```sh
npm ci --prefix services/earned-work --ignore-scripts --no-audit --no-fund --offline
npm ci --prefix services/correspondence --ignore-scripts --no-audit --no-fund --offline
npm ci --prefix services/contributor-journey --ignore-scripts --no-audit --no-fund --offline
npm run build --prefix services/contributor-journey
node services/contributor-journey/export-runtime.mjs /absolute/isolated/recipient
node services/contributor-journey/export-original-continuation.mjs /absolute/isolated/overlay-recipient
```

The runtime exporter reproduced all 437 compiled/static artifact members
byte-for-byte. Its only manifest change is `hostLockSha256`, receiving the
legitimate current root lock. The opportunity exporter reproduced all 187 source
and 106 generated members plus all three metadata files exactly. Their source
commits, original producer, continuation scope, SQL, human assets and authority
bindings were preserved. No new signer or qualification was issued.

The corrected caller pin covers 1,171 exact members, including both machine
ports and their transitive runtime, migrations, immutable gateway archives,
continuation helper, existing contributor edge and unchanged received artifacts.
All 21 earlier caller descriptors remain accepted, including the previous current
`sha256:fc14eac1601172bfbfc9a30480455281ae75d6528e24733740f022939496d68e`.
The new closure is
`sha256:fb7f1607a09fac2527a394ec26fee28d240f0db3d14dc43eb5a15f83141cdc63`.
Replaying the predecessor manifest against these bytes still refuses. Cold
production installation verifies the caller and contributor artifact, imports
both Postgres ports, and refuses changed machine, PG, continuation, artifact and
authority members before execution. Existing original-task and foundry private
journeys retain their own mounted HTTP/restart and tamper controls.

## Root installation and qualification boundary

Use the current installation bundle's `release.example.json`, which carries the
exact final SDS export. Do not use the older commit embedded in the companion's
historical example. Pilot controller source remains at
`931b7166842cbb0aa6db2041150041f9798dc49a`, tested implementation
`abf7239f0e414677cd1795ba08158f44957bb149`, [draft PR412](https://github.com/epistemedeus/pilot/pull/412).
Its preserving profile and all original environment policy tests are retained.

Bind Root's current complete unmasked baseline, current provider key inventory,
exact completed predecessor journal, reviewed additive machine overlay and
existing private values. Keep all 59 original values, including contributor and
foundry bindings. Never substitute fixture signatures for a current deployment
qualification. If the retained ingress is `litespeed-https-only`, the existing
qualification verifier must accept the current exact source/artifact identity
before provider writes. A qualification for different edge bytes correctly
refuses; Root's actual transport receiving is separate from these source tests.
Do not bypass that refusal or silently update a binding in the machine overlay.

After checking out the bundle's exact source and installing its production lock,
Root can perform this private, read-only source preflight without printing values:

```sh
node --input-type=module - "$AE19_PRIVATE/current-authoritative-environment.json" <<'JS'
import {readPrivateJson} from './server/lib/contributor-environment-packet.js';
import {verifyContributorRuntime} from './server/lib/contributor-artifact.js';
import {loadContributorHttpsQualification} from './server/lib/contributor-https-qualification.js';
try {
  const baseline=await readPrivateJson(process.argv[2]);
  const env=Object.fromEntries(baseline.env_vars.map(row=>[row.key,row.value]));
  await verifyContributorRuntime('vendor/neomorphic-contributor-journey',env.CONTRIBUTOR_JOURNEY_SOURCE_COMMIT);
  if(env.CONTRIBUTOR_DESK_INGRESS_MODE==='litespeed-https-only') await loadContributorHttpsQualification(env);
  console.log('retained_contributor_source_qualification_verified');
} catch { console.error('retained_contributor_source_qualification_refused');process.exitCode=1; }
JS
```

Then use the existing producer and controller, preserving the full-set PUT and
exclusive journals. Root binds only enrolled account/domain/private paths in
the bundle's example; no environment is reconstructed manually:

```sh
node "$AE19_SDS/server/lib/machine-services/deploy/environment-packet.mjs" \
  "$AE19_PRIVATE/current-authoritative-environment.json" \
  "$AE19_PRIVATE/current-key-inventory.json" \
  "$AE19_PRIVATE/reviewed-machine-overlay.json" "$AE19_PRIVATE/machine-packet"
node "$AE19_PILOT/tools/ops/hostinger-managed-release.mjs" "$AE19_MANIFEST" validate
node "$AE19_PILOT/tools/ops/hostinger-managed-release.mjs" "$AE19_MANIFEST" prepare
```

Complete G1's existing additive-schema install/inspection/free-grant harness on
this source and the same packet. The underlying commands remain
`machine-services:prepare`, `machine-services:migrate`, `machine-services:inspect`
and `machine-services:provision -- --grant-file /private/enrolled/monitor-grant.json`.
The enrolled role's CREATE privilege was already received by Root; migration
checks it again. No schema, env-key or adapter contract changed in this amendment.

```sh
node "$AE19_PILOT/tools/ops/hostinger-managed-release.mjs" "$AE19_MANIFEST" install
node "$AE19_PILOT/tools/ops/hostinger-managed-release.mjs" "$AE19_MANIFEST" start
node "$AE19_PILOT/tools/ops/hostinger-managed-release.mjs" "$AE19_MANIFEST" read
# Only after a known terminal build; require its exact candidate source:
node "$AE19_PILOT/tools/ops/hostinger-managed-release.mjs" "$AE19_MANIFEST" restore-linkage
node "$AE19_PILOT/tools/ops/hostinger-managed-release.mjs" "$AE19_MANIFEST" read
```

Use later finite `read` calls for a still-running build. Never replay an unknown
POST or replace its journal/release ID. Receive the actual private hostname and
existing funded-task/contributor/foundry callers, free gateway work, autonomous
scheduler recovery, delivery/ack and restart readback before a serving claim.
Payments, public reads and human asset publication remain off.

For explicit environment rollback after a known terminal candidate and restored
original linkage:

```sh
node "$AE19_PILOT/tools/ops/hostinger-managed-release.mjs" "$AE19_MANIFEST" rollback-environment
node "$AE19_PILOT/tools/ops/hostinger-managed-release.mjs" "$AE19_MANIFEST" read-rollback
```

This restores the complete authoritative predecessor environment and retains
schemas/receipts. A code rollback uses Root's exact saved deployed predecessor
source, not an assumption that a previous feature export was installed. No live
host request, retained-database mutation, credential change or paid action was
performed in this source qualification.
