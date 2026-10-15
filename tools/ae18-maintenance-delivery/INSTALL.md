# Installation and bounded acceptance

Use Node 22.14.x on the actual Cursor VM and the enrolled GH_CONFIG_DIR. Do not
change credential helpers. The existing deployment target is **SameDayDesk's
Hostinger Node process**, `node server/index.js`, mounting current Neo
`services/machine-gateway` at `/api/machine-gateway`. Hostinger static hosting
cannot run this dynamic Node/SQLite API. Root owns shared registry/mount/release
changes and live configuration; this export performs none of those changes.

From an exact reviewed checkout, create a new destination outside the repo:

```sh
mkdir -p /home/ubuntu/.cache
flock /home/ubuntu/.cache/pilot-ae18-build.lock \
  node tools/ae18-maintenance-delivery/bin/install-accept.mjs \
  --destination /tmp/ae18-244005-root-cold
```

The destination must not exist. The command fetches full immutable pins from
PINS.json into exclusive detached dependency checkouts; installs locked merchant,
customer-example and gateway dependencies with scripts disabled; packs this
consumer; installs it outside the repo; and invokes the installed package's
actual mounted acceptance. It creates only disposable test HTTP writes, fixed
unsigned fixture authorities and temporary local stores. It never enrolls a
real user, generates a live credential, signs, pays, deploys or installs a timer.
Inspect `install-receipt.json`, `acceptance.json` and per-command `logs/`.
Success requires the expected changed recipe/template, accepted bounded work,
exact new-process durable readback, zero effect counts, and unchanged GET count
on retry/readback. An exit code or HTTP 200 alone does not establish acceptance.

For already prepared dependency-ready mounts, call the package without install:

```sh
export SDS_INPUT_ROOT=/absolute/sds-at-50210d0dbd2e24194c84b486bf31dc3c705ba06b
export MERCHANT_INPUT_ROOT=/absolute/merchant-at-82a51274e7dc7a7600b90f1317a6be6b28442592
export GATEWAY_INPUT_ROOT=/absolute/neo-gateway-at-7e5078bbf213ae3d1ff8d4638199ff8d1d1d81a8/services/machine-gateway
flock /home/ubuntu/.cache/pilot-ae18-build.lock \
  node tools/ae18-maintenance-delivery/bin/accept.mjs /absolute/mounted-evidence.json
```

`SDS_INPUT_ROOT` must contain the unmodified E11, recurring recipes and result
reuse trees. Recipe/reuse bytes at the E11 pin equal the required d8cea059 pin.
Merchant requirements are package name `x402-merchant`, `page-change-http.mjs`,
customer example, C31 `pilot/page-change-brief/v1`, C34 extract-batch/skills,
root Express and customer Ajv. Use both lockfiles. The consumed descendant is
82a51274; recipe's original declared master f9dd59ae remains in PINS.json and
is verified as its ancestor. Runtime verifies the recorded dependency blobs.

Root's exact mount/configuration entry is exported as
`@samedaydesk/maintenance-delivery/runtime`, or use the common-registry example in
INTEGRATION.md. Prepare private files outside replacement build trees:

```js
const config = {
  inputs: { sdsRoot: '/absolute/pinned-sds', merchantRoot: '/absolute/pinned-merchant',
    gatewayRoot: '/absolute/pinned-neo/services/machine-gateway' },
  stateFile: '/existing/private-state/machine-gateway.sqlite',
  tenantsFile: '/existing/private-state/tenants.json',
  paymentsEnabled: false,
  maintenance: {
    descriptorPath: '/existing/private-input/descriptor.json',
    rightsPath: '/existing/private-input/rights.json',
    priorPath: '/existing/private-input/prior.json',
    ownerTenant: 'existing-owner-tenant', reviewTenant: 'existing-review-tenant',
    mountedOrigin: 'http://127.0.0.1:EXPLICIT_OWNER_SOURCE_PORT'
  }
};
```

Root supplies actual canonical absolute paths and explicit owner source port.
Use `descriptorSchema` and `rightsSchema`; executable `bin/harness.mjs` constructs
a complete concrete example, emitted as descriptor/rights in acceptance.json.
The prior must be immutable and carry sourceId/taskId/sha256/payload/sequence/
createdAt/payment. Its entitlement descriptor must bind the retained task,
source and digest. Select title/description contract fields. Set expected source
SHA-256 from exact owner-supplied JSON bytes, explicit finite expiry and current
rights validity/revision/reviewer. Paths and bearer values are never accepted
from public operation input. Runtime configuration is trusted operator material.
Canonical private state directory is mode 0700; tenant file is mode 0600. Reuse
existing enrolled authorities and preserve their identities and receipt history.
Only the configured owner gets `maintenance.<occurrenceId>.assess`; only the
separate reviewer gets `maintenance.<occurrenceId>.review`. Preserve other route
grants. No new enrollment command is required or run by this export.

For a disposable local config, the actual listener command is:

```sh
node /installed/package/bin/serve-local.mjs /absolute/runtime.json
```

It prints a loopback port. The production host should instead import
`mountMaintenance` and mount before its global JSON parser, using the existing
gateway if already mounted. Do not run an additional resident listener. Root
owns deploying that mount through the existing release workflow, durable local
disk, existing TLS ingress and supervisor. No automatic host edit is made here.

Cold consumer configurations for `bin/companion.mjs execute <config.json>` use
`{baseUrl,credentialFile,stateFile,routeId,input,resume}`. `stateFile` must be new
for first execution; set resume true to replay the saved quote/key. Assess input
is `{descriptorDigest}`. Review input is the exact exported review schema and
must reference the completed assessment ID/digest. Readback uses
`bin/companion.mjs readback <config.json>` with
`{baseUrl,credentialFile,receiptId}`. The installed `sds-maintenance-accept`
companion is only for cold acceptance; it is not a shared `ae` command.

Upgrade: pin and install the new package beside the current version, run cold
acceptance, preserve state/tenants/immutable descriptors/priors and gateway schema
v1, and restart only the existing host after Root's registry review. New
source/task/version means a new finite occurrence ID and route pair. Code with
changed semantics requires a new route revision; old receipts remain readable.
An uncertain first operation must be reconciled, not replaced with a new key.

Rollback: remove/disable only this occurrence's execution route grants through
Root's existing mount configuration, retaining an authenticated readback path
and all gateway SQLite/WAL data, old receipts, tenant IDs, priors and terms.
Drain the existing host before code replacement; keep a SQLite-consistent
backup. Do not copy only a live WAL database's main file, delete state or reset
usage. No timer/service was installed by this package to remove. Public pages,
status copy, payment settings and other controllers remain their owners' work.
