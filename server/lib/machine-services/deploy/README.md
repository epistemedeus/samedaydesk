# SameDayDesk existing Node runtime install package

This is an implementation and local acceptance package, not a live deployment.
Root binds existing secrets and performs the existing Hostinger deployment. No
new host, port, systemd unit, timer, billing integration or cloud service is needed.
Human pages, navigation, existing route configuration and proxy authority are unchanged.

The latest [composed source qualification and finite preserving-release sequence](SOURCE-QUALIFICATION.md)
supersedes older candidate pins. Use the current installation bundle's exact
source/manifest, the unchanged Pilot PR412 controller and Root's authoritative
complete baseline. Source qualification does not replace Root's actual transport
qualification or hosted receiving.

The authoritative source pins are [PINS.json](../PINS.json). Both repaired
services are received from Neomorphic `667fba353e9082d8a0842437442dabc42843abf8`
(independently tested runtime `4248874f2fa63636659fad164fb29ed193018104`).
The selected upstream gateway **0.1.1** archive is retained byte-for-byte at
`server/vendor/machine-gateway/releases/neomorphic-machine-gateway-0.1.1.tgz`,
SHA-256 `ee120eaac84f58f759d5857355220685cebcc53d739cead76700720a2821b53d`
(49,637 bytes). `deploy/RECEIVED-0.1.1.json` verifies every shipped file against
the exact received source. SDS adds explicit async/PG adaptations in this feature
branch; extracting the SQLite upstream archive must not overwrite them.

The original gateway source was `7e5078bbf213ae3d1ff8d4638199ff8d1d1d81a8`;
its immutable **0.1.0** archive remains unchanged with SHA-256
`730a959d3d8bd7398a68015cc8f3ca1746170c0177093d5bf0d03faa75c832d3`.
The original monitor and its complete change-monitor foundation were from
`0ad6691f79225cfba782971a910c0e79d371c8f3`; that foundation remains unchanged.
Names/shapes are from Pilot
`ae1d2d22322a95bce0195d28cfb4811dc448b23d` (original inputs retained beside this file).
The old gateway patch targeted SDS `d8cea059213e06d2f263be67f82e498f8052a50f`;
this integration was adapted to actual SDS base
`b069bad3abd40b53e826003d924c7f0ac786f856`, including its contributor ingress/lifecycle.

## Persistence and isolation

Production selects Postgres by default. `openInstalledStore` requires the
already configured `CORRESPONDENCE_DATABASE_URL`, hostname verification
(`sslmode=verify-full`), and the existing CA policy. If that URL uses weaker
TLS, bind `MACHINE_SERVICES_DATABASE_URL` to the same host, port, database and
user with verify-full, plus the CA under the machine-specific keys. The old
correspondence URL and CA variables stay untouched. Generic `DATABASE_URL`,
Supabase HTTP credentials, a new database service, and ephemeral SQLite are not fallbacks.

Two additive schemas, `pilot_gateway` and `pilot_monitor`, use the existing DB
and its enrolled role. Root confirmed that the retained correspondence URL
already uses verify-full on the retained Supabase project with its existing
project role, and independently verified that role's additive schema CREATE
privilege. Actual migration still checks `has_database_privilege` and
`has_schema_privilege` before DDL; its username is never evidence of privilege.
That role needs CREATE SCHEMA for initial installation and normal
SELECT/INSERT/UPDATE/DELETE/sequence access in these schemas for serving. No
objects in correspondence, contributor, product or public schemas are changed.
Each pool has at most two connections (four total), a three-second connect
deadline, two-second lock deadline and five-second statement deadline.
There are no network calls inside DB transactions. Per-service transaction locks
serialize host budget, global payment identities, source gates and lease
transitions across replicas. Queries scope owner-visible records by tenant;
composite foreign keys bind artifacts to their monitor or quote owner.
Immutable snapshots/events/run outputs and delivery attempt logs refuse updates.
Schema identity/version/completeness are checked before serving. Requests never migrate.

The PG ports adapt the pinned SQLite state transitions to async queries. Native
SQLite remains supported for local Node 22 bounded tests through the original
stores, and by `*_STORE=sqlite` outside production. They are separate databases;
this release does not silently import a prior SQLite installation or reset its
budgets. Root must not enable a new empty backend for an already used tenant.

Gateway admission commits calls/reservations and a unique tenant/idempotency
receipt before a provider runs. Readback and exact replay survive deployments
and expired quotes. An ambiguous admission/IO or interrupted deadline is never
automatically re-executed. A running receipt becomes `uncertain` after its finite
deadline; an already committed completed receipt remains stable. HTTP capture
retains the upstream all-answer public DNS check, pinned connection address,
redirect refusal and size/deadline bounds. Useful free `lockfile.delta` executes
the real worker/engine. Payments remain disabled, with no fund movement.

Received safety repairs are active code, including every async PG boundary.
Gateway provider/adapter entry checks the persisted deadline after each awaited
admission/payment transition. A conditional PG write fences late completion at
the database clock. SDK diagnostics are privately drained; decoded settlement
bounds and unknown-outcome replay retain one spend reservation. These unsigned
fixture tests do not qualify a paid rail.

Monitor authority is awaited after DNS and immediately before socket creation;
a Promise is never a grant. The same monotonic elapsed deadline covers that DB
round trip, socket entry and response completion. Run lease checks include time
spent awaiting PG locks/queries. Revoke expires active/paused monitors and advances
the generation in the same transaction, so a fast regrant cannot revive old work.
Malformed projections, missing/duplicate metrics and arbitrary failure strings
produce bounded unavailable evidence, preserve prior baselines and cannot leak
notification text. Native local stores reject foreign/linked/shared paths and
safely adopt only the exact legacy schema with WAL history intact.

Monitor claims reserve budgets before dispatch. Run token, generation, finite
lease, current-run identity, tenant entitlement and status fence completion.
A staged response recovers without another source request. Lost unstaged work
records unknown usage and never repeats that slot. Paused/cancelled work cannot
emit a late change event. Polling uses stable event/delivery keys and visibility
timeouts; acknowledgement is explicit and idempotent. Foreign monitor artifacts,
foreign/unknown cursors and expired cursors are refused. Retention is bounded by
the upstream budgets (200 host monitors, 100 retained run outputs per monitor,
plan event caps and 1–30 day payload retention).

## Non-secret installation commands

Use the reviewed feature branch/HEAD from `../RESULT.md` in the existing
Hostinger source checkout. The existing startup remains `node server/index.js`;
`PORT` continues to be injected by Hostinger. Preserve the complete current
environment (all 59 retained values) and build command, including contributor/foundry configuration.
This package never submits a Hostinger environment or publishes a page.

On the owner VM, after checkout (all heavy commands share the prescribed lock):

```sh
flock /home/ubuntu/.cache/pilot-ae18-build.lock npm ci --omit=dev --ignore-scripts --no-audit --no-fund
npm run machine-services:prepare
npm run machine-services:migrate
npm run machine-services:inspect
npm run machine-services:provision -- --grant-file /private/enrolled/monitor-grant.json
```

Bind the names in `env.keys` through Root's existing secret channel before
running the last four commands. Keep feature flags off during installation.
`migrate` is transactional per schema and idempotent; a partial two-schema
installation is safe to rerun. It does not provision callers or perform IO to
monitored sources. `provision` accepts a finite free grant (`id`, distinct `token`
and `readerToken`, optional `plan:"free"` and ISO `entitlementUntil`); it prints
only the tenant, plan, expiry and `charged:false`. Credential rotation preserves
tenant usage. `MONITOR_GRANT_JSON` is an installer-only alternative to the private
grant file. The listener does not require that grant input.

Gateway enrollment uses the original pinned command to generate a credential
file without printing it:

```sh
node server/vendor/machine-gateway/bin/enroll.mjs --tenant first-caller --config /private/enrolled/gateway-tenants.json --token-file /private/enrolled/first-caller.credential --max-calls 1000
```

Bind the config's hashes as `MACHINE_GATEWAY_TENANTS_FILE` or
`MACHINE_GATEWAY_TENANTS_JSON`; transfer only the credential file through the
existing secret channel. Preserve tenant IDs and hashes across deploys. JSON/CA
inputs reuse `server/foundry/private-materialize.js`: dedicated directory mode
0700, files 0600, no symlinks/hardlinks, outside checkout/public_html, exact
existing-content checks. A directory such as `/tmp/sds-machine-services-install1`
holds regenerated configuration only, so local-disk durability is unnecessary.
Both JSON inputs are bounded to 64 KiB by that existing helper. For a changed
configuration use a new private directory/version; keep Postgres state and tenant IDs.

Hostinger's environment setter replaces the full set. Generate a private
reviewable install/rollback pair from an authoritative unmasked baseline and a
current key inventory (inventory values may be masked):

```sh
node server/lib/machine-services/deploy/environment-packet.mjs /private/existing-env.json /private/listed-env.json /private/machine-overlay.json /private/prepared-packet
```

The overlay uses `{ "env_vars": [{ "key": "MONITOR_ENABLED", "value": "1" }] }`
shape. Only machine-service keys are accepted. All unrelated values are retained;
missing baseline coverage, masked baseline values, non-Postgres production stores
or enabling payments are refused. Output files are exclusive mode-0600 writes;
the receipt prints counts only. Nothing is sent. Root applies this reviewed full
set through the enrolled deployment path, setting `MACHINE_GATEWAY_ENABLED=1`,
`MONITOR_ENABLED=1`, `MONITOR_SCHEDULER=1`, both stores `postgres`, and
`MACHINE_GATEWAY_PAYMENTS_ENABLED=0`.

## Scheduler and shutdown

There is one existing shared Express listener. `/api/machine-gateway` and
`/api/monitor` own bounded raw body parsers before the host JSON parser and API
fallback. Existing health, raw webhooks, MCP, contributor and SPA routing keep
their order. Invalid/disabled configuration affects the respective prefix.

`MONITOR_SCHEDULER=1` arms the existing `armScheduler` implementation after the
normal listener starts. The monitor adapter runs one check per tick by default,
at most ten with explicit `options.maxTick`; each GET is at most ten seconds.
No parallel ticks run in one process. Due queries include outstanding leases
and staged work so a restarted process recovers them. Enroll/pause/resume/cancel
replan the timer after committing. Idle stores have no timer; there is no interval,
systemd service, resident worker, model call or separate port. State and lease
fences protect accidental multiple host replicas; source cooldowns remain shared.
Run `npm run machine-services:maintenance` from an already available maintenance
job if the store remains idle/paused for long periods; normal ticks also recover
and prune. No new maintenance job is installed by this package.

Initialization is single flight per API, including failed first opens. A transient
connection/recovery/capacity or bounded query/lock failure permits another open
after 1, 2, 4, 8, 16, then at most 30 seconds. Gateway callers share that cooldown;
they cannot cause a connection storm. Once a store opens successfully it is
retained, allowing the existing bounded PG pool to reconnect normally.

`arm()` establishes one scheduler recovery owner even if the first store open
or initial due query fails. The same backoff handles failed automatic due queries,
ticks and mutation replans. It replaces the stopped scheduler only after any
previous bounded tick has finished, reuses the successful store, and resumes
persisted due/lease/staged work without another caller. Successful idle planning
leaves no timer. Disabled flags, invalid configuration, TLS trust/authentication,
missing/foreign schema and unknown errors never enter automatic retry. Correct
permanent refusals through the existing configuration/install workflow and restart.
Errors contain fixed service codes only. A scheduler failure after a durable
mutation does not discard its successful HTTP acknowledgement.

Shutdown aborts monitor IO, stops both due and retry timers, waits for pending
initialization/planning and its bounded tick, and closes every owned store once,
even if another store's close fails. A plan finishing after shutdown cannot install
a timer. This uses the existing scheduler and listener resource lifecycle, with
the existing four-second shutdown deadline. A forced host exit
follows the durable unknown/lease-recovery protocol. The old shutdown deadline
and other resources are unchanged. Data backup/restore uses the existing
Postgres backup procedure, including both new schemas; do not copy SQLite/WAL
files as a production backup.

## Actual checks and remaining deployment acceptance

```sh
npm run test:machine-services
npm run test:machine-services:sqlite
npm run test:machine-services:regression
```

Each of these three npm scripts already acquires
`/home/ubuntu/.cache/pilot-ae18-build.lock`; do not wrap it in another acquisition
of that non-reentrant lock. Serialize other heavy commands with one acquisition.

The first command creates an owned, disposable PostgreSQL 16 cluster with a
fixture CA and verify-full server certificate, runs cold Node app processes and
HTTP callers, then stops only that cluster. It tests matching TLS, hostname
failure, adapter/config/schema refusal, lost acknowledgement/commit responses,
cross-pool uniqueness, budgets, leases, cancellation, real changing local HTTP
content, consumer polling/duplicate ack, restart/readback, immutable artifacts,
foreign keys/cursors, full environment preservation and old app routes. It uses
no production credentials or source data. The second runs the vendored native
SQLite suites, including SSRF and actual crash/cold-client cases. The third runs
existing app startup, parser/webhook, SPA and listener-drain regressions.
The first also runs controlled clock/failure lifecycle tests and mounted TLS PG
cases raising real transient database failures. Recovery without another caller,
future caller recovery, initial/automatic planning, bounded repeated failures,
single-flight stores/ticks, shutdown races and disabled/permanent refusals have
separate controls. These local fixture observations do not establish the retained
host's actual startup/recovery latency or installation result.

After Root deploys this exact source, record the actual HTTPS hostname and
deployment HEAD. Use `/api/machine-gateway/healthz` (persistence `postgres`,
payments false), discovery, authenticated free quote/execute/readback and a
controlled app restart. Use `/api/monitor/healthz`, `/v1/manifest`, a
customer-authorized free changing public HTTPS source, events/deliveries, explicit
ack and readback after a controlled restart. Record observed schedule/latency and
usage, plus old route checks. The local controlled source is labeled fixture
evidence and does not establish public launch, paid acceptance or production durability.

## Rollback

Root sets the three flags in `rollback.json` to `0`, preserves all other current
environment values, and restarts the existing app. Keep both schemas, tenant IDs,
credential authority and receipts; no down migration deletes state. The private
packet's `rollback.json` restores the exact prior complete environment if that
snapshot is still current. Refresh it if another owner has since changed the
environment. Disable the flags before any code rollback; re-enable only a runtime containing
the received safety repairs. Code rollback uses the reviewed integration commits on this branch;
it must preserve data, unrelated jobs and prior private contributor configuration.
Re-enabling the same installed adapter reads the same receipts and inbox.
