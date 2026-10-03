# Root installation packet — existing Hostinger Node22 app

This packet is prepared and tested locally; production steps below were not run.
Root owns credential resolution, merge, deployment and outside invitations.
Use [RESULT.md](RESULT.md), [TESTS.json](TESTS.json) and the owning
[host receiver](../../FOUNDRY-HOST-RECEIVER.md) /
[activation procedure](../../../server/foundry/activation/ACTIVATION.md).

## Exact source and artifact receipt

Repository `epistemedeus/samedaydesk`, feature
`codex/sol-sds-visitor-delivery-261003`, main base
`1f333f33e088ffd466f8ce13fb7202e8d4e6d0b5`. Tested integration:
`02b514cf1c47a1d690670029c5c84c7024a9e4cb`; 471 pass / zero fail or skip.
Caller 0.1.1 closure pin: `b529cf9266d63c4c0a0408d402ead2570022a50a`.
Final feature head is independently read back into the task-owned
`ROOT-EXPORT.json`/`RUN.json`, outside this self-referential Git report.

Review in an isolated integration checkout; do not replace the running app
checkout or merge either owner's whole ancestral history:

```sh
git fetch origin main codex/sol-sds-visitor-delivery-261003
git rev-parse origin/main
git rev-parse origin/codex/sol-sds-visitor-delivery-261003
git diff --check origin/main..origin/codex/sol-sds-visitor-delivery-261003
git diff --name-only origin/main..origin/codex/sol-sds-visitor-delivery-261003
```

Compare main to the exact base above and feature head to Root's exported receipt.
If main moved, receive that delta and retest before using the existing repository
merge/release flow. Preserve human files, immutable archives and canonical VF.

Artifact locations / identities:

- `tools/hosted-useful-journey-100346/successors/0.1.1/hosted-useful-journey-0.1.1.tar.gz`:
  10,377 B / `84cbb35758e8466cf36dd99d804b0b4c09251b9dc4c2820239c98568b494323d`.
- `tools/relevant-activation-composition-100384/export/relevant-activation-caller-0.1.1.tgz`
  and identical `client/public/for-agents/relevant-activation/` copy:
  68,369 B / `994ffe92d532c309a1f0b99f20ffcffc6a0c01846f44054f782c0f3ff7744c5b`.
- Frozen EIN `/downloads/ein-activation-continuation-v0.1.3.tgz`:
  48,615 B / 39 members /
  `1273c33e77aadef2eececd1d1c7269ef9c9205558c223adb2982e7517d523ad2`.
  Keep its received vendor closure and original caller 0.1.0 unchanged.

Reproduce source checks on Node22/PostgreSQL16. `SOL384_EIN_SOURCE` must name an
isolated exact EIN `9b71db2a00b96f1b2ffa8165d1e19cd0e0edfc42` archive with its
declared pnpm11.25.0 frozen-lock dependencies. The declared merchant checkout
must exist at the resolver's documented local location; receiving used
`/tmp/merchant-input/x402-url-extractor` at
`015f07d5a75d02a4e74709b17b2b1176501e92a5`. Neither is a production credential.

```sh
npm ci --ignore-scripts
node docs/reviews/sol-sds-visitor-delivery-261003/verify-local.mjs
npm run build
node docs/reviews/sol-sds-visitor-delivery-261003/startup-smoke.mjs
node tools/hosted-useful-journey-100346/scripts/export.mjs
SOL384_SOURCE_PIN=b529cf9266d63c4c0a0408d402ead2570022a50a node tools/relevant-activation-composition-100384/scripts/pack.mjs
```

The combined runner creates/stops only its disposable PG. Preserve generated
test receipts in the receiving folder; do not blanket-stage build lockfile
normalization or another owner's historical L08 receipt.

## Existing secrets and installer

Existing hosting: Hostinger, one recorded Passenger Node22 process,
`node server/index.js`. This was established by owning repository evidence;
the hosting panel/process count was not inspected in this receiving. The
authorized PG connection identity and deployed private file paths are not in
the received evidence. Root resolves those existing records; no provider or
credential is inferred from product Supabase settings.

| Name | Location / requirement |
| --- | --- |
| `CORRESPONDENCE_DATABASE_URL` | Existing authorized correspondence PG connection, supplied through existing Hostinger secret configuration; never product HTTP URL/service-role auth |
| `CORRESPONDENCE_ADMIN_TOKEN` | Existing secret configuration; 24+ characters |
| `FOUNDRY_HOST_PROFILE_FILE` | Existing private host-profile path; owning runbook's prescribed location is `/secure/foundry-host-profile.json` |
| `FOUNDRY_PARTICIPATION_KEY_FILE` | Existing private key path; prescribed `/secure/foundry-participation.key` |
| `FOUNDRY_PRIVATE_PROFILE_FILE` | Existing original participation profile; installer only; prescribed `/secure/foundry-private-profile.json` |

The `/secure/` names above are runbook locations, not an assertion those files
already exist on production. Root supplies the actual recorded paths. All three
files remain outside Git, owner-readable regular files at mode0600. Do not
print values, copy EIN credentials, fabricate profiles or bootstrap principals.

Keep `FOUNDRY_PRODUCTION_ACTIVATE` unset or `HOLD`, serving opt-ins unset until
installation succeeds. With the resolved existing installer environment:

```sh
node server/foundry/install.mjs --migrate --install
```

Retain stdout as an installation receipt in Root's existing secure operations
receipt location. Verify `ok:true`, `migrated:true`, `installed:true`,
`schema:pilot_correspondence`, charged count, terms hash, receiver/config/profile
identities and capacity. Same-profile repeats preserve charged counts/terms;
different profiles are refused. Never delete installation/receipt rows to retry.
Startup does not migrate. There is no destructive down migration.

After that receipt, supply these nonsecret serving settings in the existing
Hostinger app configuration, alongside the existing secret names/paths above:

```text
NODE_ENV=production
FOUNDRY_HOST_OPT_IN=1
HOSTED_USEFUL_JOURNEY_OPT_IN=1
CORRESPONDENCE_STORE=postgres
CORRESPONDENCE_PG_SCHEMA=pilot_correspondence
CORRESPONDENCE_POOL_MAX=2
CORRESPONDENCE_BODY_LIMIT_BYTES=524288
```

Preserve existing trust-proxy/CORS/product/Stripe/email configuration. The journey
independently caps raw intake at65,536 B, response at65,536 B, command time at30s
and aggregate work at524,288 B; callers may tighten them. EIN caller intake32KiB,
default total time15s, hard maximum60s and bounded cumulative response reads.

One web process with base pool2 plus entry/work-cell/integration pools uses8
connections; the journey adds at most2 active connections through the installed
transaction seam, for10. An already-existing worker adds2, for12. Check actual
processes/other consumers against the existing envelope. Do not add a worker,
new database, provider plan or process replica to satisfy this packet.

## Deploy and read back

Root merges the exact received source through the existing release process,
builds and restarts the existing Hostinger Node app. Then run anonymous readback
from a separate receiving checkout:

```sh
node docs/reviews/sol-sds-visitor-delivery-261003/read-only-production.mjs
node server/foundry/activation/postdeploy-accept.mjs --origin https://samedaydesk.com --require discovery
```

The first command records observations and verifies acquired bytes; it does not
turn an unavailable route into successful enrollment. Require live recipes,
client metadata and archive200; hosted-useful health reports enabled PG; existing
visitor-entry contribution binding is correct; public readiness/MCP remain
available; uploads remain501. Verify both discovery links and caller successor
68,369-byte digest above. Current receiving instead observes correspondence
unconfigured, entry503 and hosted-useful/caller successor404. Its archive flags
remain false. Promote only the publication/readback fact actually verified.

A real supplied-task run happens separately after enrollment, using an existing
project-scoped grant and a caller-owned operation key, input and journal:

```sh
node tools/hosted-useful-journey-100346/cold-client.mjs evaluate --origin https://samedaydesk.com --input "$SDS_CALLER_INPUT_FILE"
node tools/hosted-useful-journey-100346/cold-client.mjs run --origin https://samedaydesk.com --project "$SDS_CALLER_PROJECT_ID" --input "$SDS_CALLER_INPUT_FILE" --operation-key "$SDS_CALLER_OPERATION_KEY" --journal "$SDS_CALLER_JOURNAL_FILE"
node tools/hosted-useful-journey-100346/cold-client.mjs recover --origin https://samedaydesk.com --project "$SDS_CALLER_PROJECT_ID" --journal "$SDS_CALLER_JOURNAL_FILE"
```

Grant stays in `USEFUL_JOURNEY_TOKEN`, never command arguments/logs. Persist the
original operation identity before transmission; lost replies are unknown until
readback. A changed task/input needs a new operation. No second physical execution
is allowed after an interrupted reservation. Optional export needs current
authority, matching digest, `optIn:true`, `purpose:later-task-reuse`.

The separately acquired caller uses `plan|handoff|return|cancel` with the original
task, independently selected source-record file and recipient. It dispatches no
formation writes. An independently authorized operator uses EIN's existing
assess/prepare/claim flow; return reads an existing application-scoped status
grant. Pending is unpaid; claim is incomplete; no LLC is offered for EIN-only or
existing-entity cases. The exact later EIN-successor condition is in RESULT.md.

## Rollback preserving receipts

Unset `HOSTED_USEFUL_JOURNEY_OPT_IN` in existing Hostinger configuration and
restart the same app. Public evaluation/client acquisition remain available;
retained job operations return503 while opted out. Existing PG grants, cells,
receipts, installation counts and retained artifacts stay intact. Re-enrollment
of the same configuration restores authorized reads; do not reset or backfill.

If separately rolling back foundry, follow the owning rollback procedure,
unset `FOUNDRY_HOST_OPT_IN` and its serving connection/profile settings, keep
`FOUNDRY_PRODUCTION_ACTIVATE=HOLD`, and restart. Keep schema
`pilot_correspondence` and all receipts. Product settings/human pages/frozen
archives stay unchanged. A source rollback uses the prior Node release with its
data untouched. No spend, payment, outside invitation or production write was
performed as part of receiving this packet.
