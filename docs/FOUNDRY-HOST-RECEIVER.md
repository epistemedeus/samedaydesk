# Foundry host receiver (opt-in, not activated)

SDS packages the visitor-foundry receiver on the existing Node process. Nothing
in this tree turns the mount on. `FOUNDRY_HOST_OPT_IN` defaults off. Production
Hostinger is unchanged until Root sets env, migrates, and restarts.

Pins:

| Input | SHA |
| --- | --- |
| SDS base | `8c7968360d64cc36f3b89486e01293c6553927cc` |
| Neo F93 export | `107363a0fabaed6133235ebda812dd5f01b07d51` |
| F93 implementation | `a7fe9f508f58d25312c64e11b4e6e3d258fbb975` |
| Neo VF08 export | `f489aca31b6670f8e4c7e3b0b73db19dede670ed` |
| VF08 implementation | `24d4d1c02abc633f9d56c9613d29dde99a7ba2a3` |

## Host order

`server/index.js` listens, and on SIGTERM/SIGINT drains the HTTP server before
closing the correspondence handle. When correspondence is configured,
`server/lib/correspondence-mount.js` calls `prepareFoundryHost` **before**
`createApp`, then `lifecycle.mount` so the foundry router is registered after
the correspondence JSON parser. `enabled: false` is the default and adds no
route. The body parser stays **32768** bytes unless `FOUNDRY_HOST_OPT_IN=1`,
which selects **524288** and rejects any other explicit size.

`FOUNDRY_F93_ROOT` must be a checkout of the F93 export whose correspondence
`dist/` has been built (`npm run build --prefix services/correspondence`). The
SDS process then imports that tree's `createFoundryExtension`. A missing layout
does not invent a second store: correspondence can still serve, and
`GET /api/correspondence/foundry-receiver` reports `layout_unavailable`.

## Migrations

Base correspondence migration first, then the additive files pinned in
`vendor/neomorphic-correspondence/FOUNDRY-PIN.json`. The listener and the worker
do not migrate.

```sh
export CORRESPONDENCE_DATABASE_URL='postgres://<user>@<host>:5432/<database>'
export CORRESPONDENCE_PG_SCHEMA=pilot_correspondence
node vendor/neomorphic-correspondence/dist/migrate.js
node server/foundry/migrate.mjs --apply
```

Schema name remains `pilot_correspondence`. Pool for the correspondence app is
1–4. The foundry extension, when loaded from the export, uses its own pool of 2.

## Root restart inputs

Set these on the existing Hostinger Node app. Do not commit values.

```
FOUNDRY_HOST_OPT_IN=1
CORRESPONDENCE_DATABASE_URL=postgres://<user>@<host>:5432/<database>
CORRESPONDENCE_ADMIN_TOKEN=<24+ character secret>
CORRESPONDENCE_PG_SCHEMA=pilot_correspondence
CORRESPONDENCE_POOL_MAX=4
CORRESPONDENCE_BODY_LIMIT_BYTES=524288
CORRESPONDENCE_CORS_ORIGINS=https://neomorphic.io
CORRESPONDENCE_TRUST_PROXY=1
CORRESPONDENCE_STORE=postgres
FOUNDRY_F93_ROOT=<neomorphic-io checkout at the F93 export, dist built>
FOUNDRY_VF08_ROOT=<neomorphic-io checkout at the VF08 export>
NODE_ENV=production
```

Restart the process that runs `node server/index.js`. `GET /api/health` stays
the SDS check. `GET /api/correspondence/healthz` is enabled only after the base
URL and token are set and the store answers. Unset `FOUNDRY_HOST_OPT_IN` and
the `CORRESPONDENCE_*` variables, then restart, to return to
`{"ok":false,"enabled":false,"reason":"unconfigured"}`.

## Worker

One bounded pass. The wrapper runs `recover`, then `dispatch` only if the
process has not been asked to stop. SIGTERM or SIGINT skips a phase that has
not started and signals the running phase. It is not a new scheduler.

```sh
FOUNDRY_HOST_OPT_IN=1 \
CORRESPONDENCE_DATABASE_URL='postgres://…' \
CORRESPONDENCE_PG_SCHEMA=pilot_correspondence \
FOUNDRY_F93_ROOT=<export> \
node server/foundry/worker.mjs recover <projectId>

node server/foundry/worker.mjs dispatch <projectId>
```

The child is the export's `scripts/visitor-foundry/integration/worker.mjs` with
`VF04_OWNER_QA_WORKER=1`. That file stays owned by VF04A.

## VF08 probe

`node server/foundry/probe.mjs` checks this machine for Linux x64, Python,
`/usr/bin/prlimit`, a readable `/proc` identity, child pipes, signals, a parent
timeout, and an rlimit kill. The prebuilt fixture is
`server/foundry/fixtures/answer.wasm`. A copied Python venv is not accepted as
portable. `--exercise-runtime` may build a fresh venv and install the pinned
Wasmtime wheel; the probe deletes that venv. The report sets
`wholeHostSandbox` to false.

## VF09 bind

`POST /api/uploads/signed-url` stays **501**. `server/foundry/vf09-bind.js`
names the receiving step: when VF09 exports its artifact loader, that loader
plugs into VF04A `IntegrationStore.admit` as the host-resolved module
reference. `bindVf09ArtifactLoader()` throws until that export exists. This
package does not add an artifact store or a second scheduler.
