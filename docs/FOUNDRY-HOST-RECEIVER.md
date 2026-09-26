# Foundry host receiver (opt-in, not activated)

SDS packages one canonical visitor-foundry receiver on the existing Node process.
Nothing in this tree turns the mount on. `FOUNDRY_HOST_OPT_IN` defaults off.
Production Hostinger is unchanged until Root sets env, runs the installer, and restarts.

| Input | SHA |
| --- | --- |
| SDS base | `8c7968360d64cc36f3b89486e01293c6553927cc` |
| Neo receiver | `1652533b1823ac33b86591ec4e931a8c4ea4aa97` |
| Neo tree | `d9c80cfd56cb05d40055dba047d6462656764ff8` |

The receiver lives at `vendor/visitor-foundry-receiver/` and is the only correspondence module (`@neomorphic/correspondence`). The scripts and packs there are the import closure of Neo `1652533b`, not the rest of that repository. There is no second F93 or VF08 checkout. `SOURCE-PIN.json` records the head.

## Host order

`server/index.js` listens, and on SIGTERM/SIGINT drains the HTTP server before closing correspondence. When correspondence is configured and `FOUNDRY_HOST_OPT_IN=1`, the mount calls `createEntryReuseMount` and serves that facade. It does not also mount raw `createApp`. The body parser stays **32768** bytes unless the flag is exactly `1`, which selects **524288**.

Startup and imports do not migrate and do not install profiles. The facade's readiness composes the original bound `store.checkReady` with the entry mount. Shutdown and startup failure close the entry mount, then the base store.

Private files, mode `0600`, are read from paths. Their contents are not logged.

```
FOUNDRY_HOST_PROFILE_FILE=<host profile JSON>
FOUNDRY_PARTICIPATION_KEY_FILE=<one-line participation key>
FOUNDRY_PRIVATE_PROFILE_FILE=<original private profile JSON, installer only>
```

Examples of the tested shapes, not live installation, are `vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry/host-profile.example.json` and `private-profile.example.json`. Copy them to `0600` files outside the repo before use. Do not commit those copies.

## Migrations

One explicit installer applies base correspondence, VF02, VF04 001–004, entry 001/002, then receiving 005. It does not run from the listener or the worker. `--install` then replays the original private profile with the receiver disabled, and enables `vf10:contribution-v2` without resetting charged rows.

```sh
export CORRESPONDENCE_DATABASE_URL='postgres://<user>@<host>:5432/<database>'
export CORRESPONDENCE_PG_SCHEMA=pilot_correspondence
export FOUNDRY_HOST_PROFILE_FILE=/secure/foundry-host-profile.json
export FOUNDRY_PARTICIPATION_KEY_FILE=/secure/foundry-participation.key
export FOUNDRY_PRIVATE_PROFILE_FILE=/secure/foundry-private-profile.json
node server/foundry/install.mjs --migrate
node server/foundry/install.mjs --migrate --install
```

Repeat `--install` is idempotent for the same profile, terms, and charged count. A different profile is refused. There is no destructive down migration.

## Root restart inputs

Set these on the existing Hostinger Node app. Do not commit values. Leave `FOUNDRY_HOST_OPT_IN` unset until the installer has been run on a database Root authorizes.

```
FOUNDRY_HOST_OPT_IN=1
CORRESPONDENCE_DATABASE_URL=postgres://<user>@<host>:5432/<database>
CORRESPONDENCE_ADMIN_TOKEN=<24+ character secret>
CORRESPONDENCE_PG_SCHEMA=pilot_correspondence
CORRESPONDENCE_POOL_MAX=2
CORRESPONDENCE_BODY_LIMIT_BYTES=524288
CORRESPONDENCE_CORS_ORIGINS=https://neomorphic.io
CORRESPONDENCE_TRUST_PROXY=1
CORRESPONDENCE_STORE=postgres
FOUNDRY_HOST_PROFILE_FILE=/secure/foundry-host-profile.json
FOUNDRY_PARTICIPATION_KEY_FILE=/secure/foundry-participation.key
NODE_ENV=production
```

`CORRESPONDENCE_POOL_MAX` stays 1–4. An opted-in web process also opens entry 2, work-cell 2, and integration 2. A worker opens another integration pool of 2. One web process at pool 2 plus one worker is 10 connections. Two web processes at pool 4 are 28 and do not fit a 24-connection envelope. Hostinger is one Passenger process; do not raise the plan to buy a larger database.

Restart the process that runs `node server/index.js`. `GET /api/health` stays the SDS check. `GET /api/correspondence/healthz` is enabled only after installation and a successful composed readiness check. Unset `FOUNDRY_HOST_OPT_IN` and the `CORRESPONDENCE_*` variables, then restart, to return healthz to unconfigured. Do not mount the raw correspondence app back over live visitor grants.

## Worker

One bounded pass of the canonical `scripts/visitor-foundry/integration/worker.mjs`. The wrapper runs `recover`, then `dispatch` only if the process has not been asked to stop. SIGTERM does not kill a healthy pass because it exceeded eight seconds. The canonical supervisor still owns assignment deadlines. Unknown physical execution keeps its reservation until termination evidence is written.

```sh
FOUNDRY_HOST_OPT_IN=1 \
CORRESPONDENCE_DATABASE_URL='postgres://…' \
CORRESPONDENCE_PG_SCHEMA=pilot_correspondence \
node server/foundry/worker.mjs dispatch <projectId>
```

## Runtime

Portable execution uses the pinned Wasmtime 49.0.0 wheel installed by `vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/setup-runtime.py` into that package's `.runtime` directory. That directory is not committed. The probe refuses a copied virtualenv and sets `wholeHostSandbox` to false. Clang is not a runtime requirement.

## Artifact loader

`POST /api/uploads/signed-url` stays **501**. Admission uses the canonical `portableArtifact` loader inside the vendored receiver. There is no public install, enroll, verify, publish, or code-execution route.

## Visitor CLI

Cold visitors use the vendored CLI. It has no host key.

```sh
node vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry/visitor.mjs register CONFIG.json
```

`CONFIG.json` is mode `0600` and names the existing `/api/correspondence` base URL plus a private continuation directory.
