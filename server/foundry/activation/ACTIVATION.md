# Foundry activation package

`productionActivate` is **HOLD**. Root owns environment changes and the hosted process restart. Nothing in this directory sets Hostinger variables, restarts a hosted process, or drops `pilot_correspondence`.

The canonical runtime is the SDS tree at `a51110ab6ede18658cac816042edc491b34e0a5e` with the vendored receiver `1652533b1823ac33b86591ec4e931a8c4ea4aa97`. I23 client evidence is Neo `89fa38bdefe067c7c88d02549cb649c1f3c33c97`, read only. See `EVIDENCE.json`. That evidence is a disposable correspondence journey. It is not this host and it is not an activation.

## Preconditions

The listener does not migrate and does not install a profile. `server/foundry/install.mjs` is the only migration path. Run it against a database Root authorizes, before `FOUNDRY_HOST_OPT_IN=1`.

```sh
export CORRESPONDENCE_DATABASE_URL='postgres://<user>@<host>:5432/<database>'
export CORRESPONDENCE_PG_SCHEMA=pilot_correspondence
export FOUNDRY_HOST_PROFILE_FILE=/secure/foundry-host-profile.json
export FOUNDRY_PARTICIPATION_KEY_FILE=/secure/foundry-participation.key
export FOUNDRY_PRIVATE_PROFILE_FILE=/secure/foundry-private-profile.json
node server/foundry/install.mjs --migrate
node server/foundry/install.mjs --migrate --install
```

Profile and key files are mode `0600` and live outside the repo. Repeat `--install` for the same profile keeps the charged count and terms. A different profile is refused. There is no down migration.

Shape required before Root opts in, checked by `assessPreconditions` without printing secret values:

| Check | Required |
| --- | --- |
| `FOUNDRY_PRODUCTION_ACTIVATE` | unset or `HOLD` |
| `FOUNDRY_HOST_OPT_IN` | unset or `0` until the installer has finished, then exactly `1` |
| `CORRESPONDENCE_DATABASE_URL` | Postgres URL naming a host and database |
| `CORRESPONDENCE_PG_SCHEMA` | `pilot_correspondence` |
| `CORRESPONDENCE_ADMIN_TOKEN` | 24 characters or more |
| `CORRESPONDENCE_STORE` | `postgres` |
| `CORRESPONDENCE_POOL_MAX` | integer 1 through 4; this foundry uses 2 |
| `CORRESPONDENCE_BODY_LIMIT_BYTES` | omitted or `32768` while opted out; omitted or `524288` when opted in |
| Host profile and participation key | set on the serving process |
| Private profile | set for the installer only |
| Installer evidence | `{ installed: true, schema: "pilot_correspondence", startupMigrates: false }` |

A complete shape still leaves `productionReady` false. A correspondence URL that contains the product Supabase project ref, matches `SUPABASE_URL`, or sets `reusedForCorrespondence` is class `correspondence_reuses_product_data_service`. The installer, the worker, and the mount refuse that URL before opening a connection. Missing `FOUNDRY_HOST_OPT_IN`, `CORRESPONDENCE_DATABASE_URL`, or `CORRESPONDENCE_ADMIN_TOKEN` is class `host_configuration_withheld` and cannot support a launch claim. A launch claim without an enrolled real store is class `hosted_success_without_enrolled_store`.

Serving process after that evidence exists:

```
FOUNDRY_HOST_OPT_IN=1
CORRESPONDENCE_DATABASE_URL=postgres://<user>@<host>:5432/<database>
CORRESPONDENCE_ADMIN_TOKEN=<24+ character secret>
CORRESPONDENCE_PG_SCHEMA=pilot_correspondence
CORRESPONDENCE_POOL_MAX=2
CORRESPONDENCE_STORE=postgres
CORRESPONDENCE_TRUST_PROXY=1
CORRESPONDENCE_CORS_ORIGINS=https://neomorphic.io
FOUNDRY_HOST_PROFILE_FILE=/secure/foundry-host-profile.json
FOUNDRY_PARTICIPATION_KEY_FILE=/secure/foundry-participation.key
NODE_ENV=production
```

Restart `node server/index.js`. Do not mount the raw correspondence app over the entry facade. `POST /api/uploads/signed-url` stays 501. One web process at pool 2 plus one worker is the connection shape in `docs/FOUNDRY-HOST-RECEIVER.md`.

## What acceptance distinguishes

`node server/foundry/activation/postdeploy-accept.mjs` classifies an observation. Exit 0 is a matched class. Exit 1 is a real miss. Exit 2 is `false_green_rejected`.

| State | What is true | What is not enough |
| --- | --- | --- |
| Disabled optional mount | `GET /api/health` is 200 `samedaydesk`, and `GET /api/correspondence/healthz` is `enabled: false` with reason exactly `unconfigured`. `invalid_config` and `store_unavailable` are degraded misses | A 200 health body, a degraded reason, or a public catalog response |
| Hosted discovery | Healthz is `enabled: true` and `store: postgres`. The facade is opt-in (`facade: true`, `rawMounted: false`, `publicExecution: false`). Its `schema` value `pilot_correspondence` is the database namespace, not the wire schema. `GET /api/correspondence/v1/visitor-entry` validates as `neomorphic.foundry.entry.v1` with contribution binding `neomorphic.foundry.entry-receiver-binding.v1`. Uploads stay 501 | Healthz alone, a profile id, or `/for-agents` |
| Successful task result | Discovery is true, the candidate is published, and `task.readback` selects that candidate: generation, manifest, content, module digest, request, Wasmtime sample status `ok`, sample output, and observation id. `task.invocation` is that canonical envelope, and its output equals the held-out portable result. When `task.clientWire` is present, that stdout invocation is the same envelope | Equal portable output, a request-matching invocation from another candidate or module, a canned sample, or a mismatched observation id |
| Durable retrieval | The task result above is true, the HTTP process has restarted, the database survived, and visitor B's own canonical readback selects the same contributed candidate. When visitor B's stdout is present, it selects that later readback | A bound task result from before the restart, a retained publication row, or equal output from a different candidate |

```sh
node server/foundry/activation/postdeploy-accept.mjs --fixture server/foundry/activation/fixtures/seeded-false-green.json
node server/foundry/activation/postdeploy-accept.mjs --origin http://127.0.0.1:<port> --require disabled
node server/foundry/activation/postdeploy-accept.mjs --origin http://127.0.0.1:<port> --require discovery
```

`--require task` needs the cold job's task fields, including `task.readback`. Equal output without that readback exits nonzero. `--require durable` additionally needs the restarted retrieval readback. A health GET cannot satisfy either.

## Local cold job

On this machine, before any hosted change:

```sh
node server/foundry/activation/cold-job.mjs
```

The command starts a private PostgreSQL 16 cluster, boots `node server/index.js`, proves the disabled mount, runs the installer, proves hosted discovery, runs one cold visitor contribution and portable invocation, restarts the HTTP process, proves a second visitor still receives that output, then boots again with foundry variables unset. The schema is not dropped. The receipt has `productionActivate: "HOLD"`, `productionReady: false`, `hostingerMeasured: false`, and `launchedService: false`. The same command rejects seeded false-green, product-data reuse, secret metadata, host-configuration withhold, and unenrolled-store claims before Postgres starts. After rollback it checks that the required `pilot_correspondence` tables and the published, project, charged, and admission rows are still present.

`node server/foundry/activation/real-store-negatives.mjs --case prove` exits 0 only when every negative case itself exits 2. Direct cases include `--case product-reuse-runtime`, `--case host-withhold`, and `--case unenrolled-store`. None of them print a database URL or the seeded password.

`server/foundry/activation/LATER.md` states which useful-jobs retrieval is already true, and which foundry facts become true only after Root activation. `node server/foundry/activation/later-retrieval.mjs` re-reads the live catalog and the human page.

The portable worker uses the pinned Wasmtime 49.0.0 interpreter installed by `vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/setup-runtime.py` into the gitignored `.runtime` directory.

## Rollback

```sh
node server/foundry/activation/rollback.mjs
node server/foundry/activation/rollback.mjs --apply
```

The first command prints the procedure and changes nothing. The second exits 2 with `production_activate_not_hold`.

## Production delta and client compatibility

`DELTA.md` records the live Hostinger app: foundry unconfigured, product Supabase/Stripe/email configured, MCP initialize unchanged, correspondence URL not enrolled. `node server/foundry/activation/delta.mjs` prints that delta with `productionReady` false. `node server/foundry/activation/delta.mjs --live` remeasures the public origin and exits 1 if the snapshot drifted. Neither command reads panel environment values or copies secrets.

`node server/foundry/activation/client-compat.mjs --origin https://samedaydesk.com` exits 0 only while that origin is still a disabled mount whose existing client matches the official MCP server. It does not report production activation. A claim that this health and MCP response is portable-kit interoperability exits 2.

The cold job records the same client surfaces across the disabled mount, hosted discovery, restart, and rollback. The official visitor client is `visitor.mjs`. The portable kit is Wasmtime 49.0.0. Those two agree on the held-out output after the HTTP process restarts, on a private Postgres cluster, not on the product Supabase project.

Root rollback, when a hosted opt-in has already happened, is: unset `FOUNDRY_HOST_OPT_IN` and the `CORRESPONDENCE_*` variables, unset the profile and key paths, and restart `node server/index.js`. Health stays the SDS check. Healthz returns `enabled: false` and `reason: unconfigured`. Do not drop `pilot_correspondence`.

Managed Node portability, the non-secret host probe, and the distinct Wasmtime 49 embedding are in `MANAGED-NODE.md`. This package does not activate Hostinger.
