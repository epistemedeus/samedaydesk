# Durable visitor-foundry integration (VF04A)

Latest receiving delta: [VF12 executed entry-to-reuse result](ENTRY-RESULT.md),
[entry client and contract](entry/README.md), and
[Heavy hosting delta](VF12-HEAVY-RECEIVING-DELTA.md). This continues the completed
VF09 source with optional bounded cold entry; default startup remains unchanged.

Current VF09 receiving amendment: [compound result](COMPOUND-RESULT.md),
[executed ports](compound/ports.json) and [Heavy hosting plan](VF09-HEAVY-RECEIVING-PLAN.md).
It adds actual VF05 participation and bounded VF08 contributed-code execution;
F93 identities and the durable revalidation lifecycle remain in force. Earlier
sections below retain their historical scope and receipts.

Executable owner QA foundation over the existing correspondence service, its
PostgreSQL store and project grants. Disabled unless explicitly mounted. No
public deployment, production migration, payment, new identity provider or
arbitrary contributed-code execution is included.

Read [RESULT.md](RESULT.md), [CONTRACT.md](CONTRACT.md) and the detailed
[Heavy receiving plan](HEAVY-RECEIVING-PLAN.md). The actual runtime composes all
three pinned foundation modules; none of their original branches was changed. The
F93 amendment applies minimal shared-module deltas in this receiving branch; its
[authoritative wire contract and conformance vectors](wire/README.md) supersede
the original gap/reference mapping. The [maintained-evidence lifecycle](lifecycle/README.md)
adds explicit installed revalidation generations without changing that identity.

## Reproduce on a remote checkout

Requires Node 22, Linux `/proc`, `/usr/bin/prlimit`, and PostgreSQL 16 binaries.
Use VF02's documented private package extraction, without installing a system
service. The private cluster runner reuses `.scratch/vf02-pg/extracted/` or
`VF02_PG_BIN`. It never reads a production `DATABASE_URL`.

```sh
npm ci --prefix services/correspondence --ignore-scripts --no-audit --no-fund
npm run build --prefix services/correspondence
node scripts/visitor-foundry/integration/wire/export.mjs --check
node --test scripts/visitor-foundry/integration/tests/wire.test.mjs
node scripts/visitor-foundry/integration/run-local.mjs test
node scripts/visitor-foundry/integration/run-local.mjs bench
node --test scripts/visitor-foundry/capabilities/tests/*.test.mjs
node --test scripts/visitor-foundry/validation/tests/*.test.mjs
node scripts/visitor-foundry/work-cells/run-local.mjs test
node scripts/visitor-foundry/work-cells/run-local.mjs regression
```

`test` starts two actual host processes and a private password-protected PG
cluster, kills/restarts hosts, forks real evaluators, executes the original six cold
CLI processes plus renewed cold use and the private maintenance CLI, and writes `evidence/journey.json`. All clients are owner QA.
`bench` offers 1/8/32/128 simultaneous HTTP clients to scoped, single-budget and
semantic-duplicate workloads. It writes `evidence/capacity.json`. Set
`VF04_EVIDENCE_DIR` to a pre-created directory for test/bench receipts without
overwriting prior evidence; the F93 runs used `evidence/f93/`, and lifecycle runs use `evidence/lifecycle/`.
The test command also runs `tests/lifecycle.test.mjs`; `VF04_TEST_NAME_PATTERN`
selects a named lifecycle regression only.

Tests create their own enrolled projects and manually issue owner/writer/reader
grants. This is an explicit onboarding limitation. A reader can discover, invoke
and decline without contributing. Recording the fixture cohort currently uses a
writer grant. Test fixture IPC controls are private to the harness and are not
HTTP operator endpoints.

## Existing host composition

Build correspondence and apply its base and VF02 migrations first. Explicitly
apply VF04 migrations 001, 002 and 003 using the existing secret-managed database and schema variables.
This is a future receiving operation, not authorization to migrate production.
Pre-F93 candidate journals require explicit offline reconciliation; see the Heavy
plan amendment. They are never silently rekeyed:


```sh
node scripts/visitor-foundry/integration/migrate.mjs --apply
```

No normal listener/worker applies migrations automatically. Mount through the
existing application's middleware and health/shutdown path:

```js
import { prepareFoundryHost } from './services/correspondence/dist/visitor-foundry/host.js';
import { createFoundryExtension } from './scripts/visitor-foundry/integration/src/extension.mjs';

const lifecycle = await prepareFoundryHost(baseStore, {
  enabled: explicitlyEnabled, // absent/false preserves the existing service
  create: () => createFoundryExtension({
    enabled: true, databaseUrl: config.databaseUrl, schema: config.pgSchema,
    poolMax: 2,
  }),
});
const app = createApp(baseStore, { ...config, bodyLimitBytes: 524288 }); // full wire vectors
lifecycle.mount(app); // existing JSON/CORS/rate/proxy middleware runs first
// Use the existing listener. Drain it before baseStore.close(), which closes
// both extension pools as well. Existing /healthz now checks all three stores.
```

Private operator enrollment is `IntegrationStore.enroll(projectId, frozenInputs)`;
it is deliberately not an HTTP route. The only installed recipe is a JSON
binding to preflight's maintained `satisfiesEnginesNode`. Enrollment freezes
inputs, baseline source digest and finite project budget before candidates exist.
The supplied experiment is owner QA, not an external trial configuration.

One bounded private worker pass:

```sh
# Existing secret-managed CORRESPONDENCE_DATABASE_URL / CORRESPONDENCE_PG_SCHEMA.
VF04_OWNER_QA_WORKER=1 node scripts/visitor-foundry/integration/worker.mjs recover PROJECT_ID
VF04_OWNER_QA_WORKER=1 node scripts/visitor-foundry/integration/worker.mjs dispatch PROJECT_ID
```

The installed worker also has bounded `revalidate` and `configure-verification`
commands with persisted JSON requests and command keys; see the lifecycle ports.
Recovery does not reassign an unknown live runner. It drains known results and
pending publications; a previously unclaimed reservation can be reconciled from
the durable prelaunch invariant. Unknown claimed work remains blocked until its
actual supervisor supplies termination/outcome evidence. No PID-only recovery or
automatic budget reset exists.

## Cold visitor

Config contains only `baseUrl`, `projectId`, and a private `tokenFile` (0600).
Request is VF01's capability-request: task ID, outcome, input, environment,
output constraints and `capabilityId:null`. No A artifact/candidate ID is needed.

```sh
node scripts/visitor-foundry/integration/cli.mjs CONFIG.json HELDOUT-REQUEST.json
```

The CLI resolves normally, receives a pinned resolution manifest, then invokes
the bounded service. Inputs are represented by digests in stored manifests;
private transcripts are never part of this flow. The original/held-out fixture
inputs are explicitly synthetic and frozen in the separately authorized
experiment record.

Hosted discovery adapters and independent operators remain Heavy/Root work.
See the receiving plan for packaging, capacity, supervision and rollout limits.
