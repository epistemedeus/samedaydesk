# VF02 voluntary work cells

Durable, optional, nonfinancial contribution over existing correspondence
projects and grants. The product source extension is
`services/correspondence/src/visitor-work-cells/`. There is no new listener,
identity service, payment ledger, artifact executor or public deployment.

The exact source pin, results and limitations are in [RESULT.md](RESULT.md).
The receiving owner should start with [HEAVY-RECEIVING-PLAN.md](HEAVY-RECEIVING-PLAN.md)
and [CONTRACT.md](CONTRACT.md). TypeScript/Zod exports in
`services/correspondence/src/visitor-work-cells/contracts.ts` are authoritative.

## Reproduce from a cold checkout

Requires Node 22 and PostgreSQL 16 binaries. Install existing pinned service
packages, compile, and run a disposable cluster. No production URL is consumed.

```sh
npm ci --prefix services/correspondence --no-audit --no-fund
npm run build --prefix services/correspondence
VF02_PG_BIN=/path/to/postgresql/16/bin node scripts/visitor-foundry/work-cells/run-local.mjs test
VF02_PG_BIN=/path/to/postgresql/16/bin node scripts/visitor-foundry/work-cells/run-local.mjs demo
VF02_PG_BIN=/path/to/postgresql/16/bin node scripts/visitor-foundry/work-cells/run-local.mjs bench
VF02_PG_BIN=/path/to/postgresql/16/bin node scripts/visitor-foundry/work-cells/run-local.mjs regression
```

On this Ubuntu 24.04 VM the following private package extraction was used. It
changes no system installation, services or global apt configuration. Package
versions were PostgreSQL 16.15-0ubuntu0.24.04.1; future repository versions may
change. It assumes the existing system libraries reported in RESULT.

```sh
mkdir -p .scratch/vf02-apt/lists/partial .scratch/vf02-apt/cache/archives/partial .scratch/vf02-pg
apt-get -o Dir::State::lists="$PWD/.scratch/vf02-apt/lists" -o Dir::Cache="$PWD/.scratch/vf02-apt/cache" -o Debug::NoLocking=1 update
cd .scratch/vf02-pg
apt-get -o Dir::State::lists="$PWD/../../.scratch/vf02-apt/lists" -o Debug::NoLocking=1 download postgresql-16 postgresql-client-16 libpq5
for package in *.deb; do dpkg-deb -x "$package" extracted; done
cd ../..
node scripts/visitor-foundry/work-cells/run-local.mjs test
```

The runner sets the extracted libpq library path, creates a random-password
loopback cluster under ignored `.scratch/`, and removes only that cluster after
stopping it. The schema is `vf02_<mode>_<pid>`. Cluster max connections 24,
shared buffers 32MiB, work_mem 2MiB, fsync and synchronous_commit enabled.
Each fixture host has one base correspondence connection and two work-cell
connections. No system Postgres, shared database, sibling process or account is
modified. Default child lifetime is 180 seconds; each HTTP request is 10 seconds.

## Mount on the existing service

Build first. Apply the existing base correspondence migration in the existing
namespace, then the VF02 migration. The current service entrypoint is unchanged;
VF02 is deliberately opt-in. Receiving code can compose:

```js
import { createApp } from './services/correspondence/dist/app.js';
import { createPostgresStore } from './services/correspondence/dist/store/postgres.js';
import { WorkCellStore, createWorkCellRouter } from './services/correspondence/dist/visitor-work-cells/index.js';

const base = await createPostgresStore(config.databaseUrl, {
  schema: config.pgSchema, poolMax: 1,
});
const cells = new WorkCellStore(config.databaseUrl, {
  schema: config.pgSchema, poolMax: 2,
  // resolveReceipt: trustedVf03Lookup, // absent => disposition fails closed
});
await cells.checkReady(); // migrations run separately before serving traffic
const app = createApp(base, config);
app.use(createWorkCellRouter(cells));
// Reuse the host's listener, shutdown hooks and readiness aggregation.
```

The base app applies its body limit, CORS and rate limiter before the extension.
Existing `/healthz` checks only the base store: Heavy must include `cells.checkReady()`
in host readiness. Never mount the fixture host or its synthetic receipt resolver
on a public service. No artifact URL is fetched by VF02.

## Cold CLI

Use an existing project writer grant, kept in a private token file. The CLI
config is JSON containing `baseUrl`, `projectId`, `tokenFile`, and optionally
`cellId` for a mutation. Create uses no `cellId`. Copy commands from CONTRACT.

```sh
node scripts/visitor-foundry/work-cells/cli.mjs begin CONFIG.json COMMAND.json ATTEMPT.json
node scripts/visitor-foundry/work-cells/cli.mjs reconcile CONFIG.json ATTEMPT.json
node scripts/visitor-foundry/work-cells/cli.mjs get CONFIG.json CELL_ID
node scripts/visitor-foundry/work-cells/cli.mjs replay CONFIG.json CELL_ID
```

An attempt is written with mode 0600 and exclusive creation before the POST.
It stores the exact target, command, key and token fingerprint, never the bearer.
A dropped/empty/malformed success is unknown; reconcile that attempt using the
same target and grant. A fresh session cannot replay another session's mutation:
it reads current state using its own grant and claims/takes over or receives a
transfer. Old receipts are historical, including old lease expiry and fencing.
