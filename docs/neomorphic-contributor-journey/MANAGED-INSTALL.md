# Existing managed SDS Node installation packet

The chosen path is the existing SameDayDesk Hostinger **Node22/Express** app,
with `server/index.js` as its entry file. It serves `/contribute/`, its private
`/contribute/_assets/` namespace and `/api/neomorphic-contributor-journey` on the
same exact HTTPS origin. Keep the serving configuration disabled. Normal SDS
routes/static resources and both source homepages retain their existing owners.
The merchant Railway project and static Neomorphic hosting are separate.

## Transport and remaining provider facts

`server/lib/contributor-managed-mount.js` is called by `createSdsApp` before
host redirects, parsing and SPA fallback. The unchanged entrypoint owns its
listener/drain. Both exact manifests and installed dependency versions are
checked before the prefix becomes available. The shared asset receiver retains
verified bytes; no response-time HTML patching or root asset aliases are used
in the managed app. Missing owned paths return404, never SPA HTML. A bad
source/member/dependency/config/enrollment leaves only these prefixes unavailable
with finite refusal JSON; unrelated SDS visitor paths remain usable.

The canonical producer export uses a named Astro build integration to place
resource URL attributes under `/contribute/_assets/`. The manifest records every
member's URL. Styles/font/chunk relative paths retain their directory structure.
The ordinary Neo build does not install this integration. Copy, layout, fonts,
navigation and API URLs are preserved. The standalone private TLS runner shares
the receiver and retains historical root aliases only on its diagnostic socket.

Hostinger's current [Node domain documentation](https://www.hostinger.com/support/how-to-connect-a-custom-domain-to-a-node-js-application/)
documents automatic SSL after domain connection. Its
[build-settings model](https://github.com/hostinger/api-python-sdk/blob/main/docs/HostingV1NodeJsUpdateBuildSettingsRequest.md)
supports Express, Node major version, an entry file and a **package script name**.
The prior owning packet identifies one Passenger/Node22 process. These sources
do not establish the deployed nearest-peer IPs, protocol-header overwrite behavior
or selected origin here. No provider configuration/domain is received by VM tests.

**One remaining controller edge record:** the existing app's exact HTTPS origin,
nearest transport peer IP(s), preserved Host, and evidence that the edge overwrites
`X-Forwarded-Proto` with one `https` value for HTTPS and does not pass caller
protocol/host claims. The candidate path is `https://samedaydesk.com/contribute/`;
verify the existing binding before durable enrollment. No DNS change is authorized.
If Passenger exposes different socket semantics/headers, receive that concrete
transition before selecting this contract. Do not guess a CIDR or hop-count trust.

`CONTRIBUTOR_DESK_TRUSTED_PROXY_IPS` is a JSON array of literal nearest-peer IPs,
with no wildcard/CIDR/default trust. Direct TLS is recognized from the socket;
plaintext backend requests require that peer and the exact protocol header.
Malformed Host/proxy/origin is refused. Forwarded client values are discarded;
account rate limits use the socket peer, so shared-edge throttling is conservative.
This does not infer independent visitors or grant client authority. Keep
`CONTRIBUTOR_JOURNEY_TRUST_PROXY=0`; origin/CSRF and `__Host-neo_contributor`
Secure/HttpOnly/SameSite=Strict/Path=/ cookies remain exact. Receiving uses an
explicit CA with certificate verification; HTTP is only the inner managed hop.

## Source and build installation

Root receives the exact Neo/SDS commits from the successor Pilot receipt and uses
the existing release process. Branch names are not admission. Both artifact
manifests must name the same Neo commit as `CONTRIBUTOR_JOURNEY_SOURCE_COMMIT`.
Hostinger serves compiled artifacts without a Neo checkout, Astro or TS loader.

The optional `build:managed-contributor` package script uses locked SDS client
dependencies, its normal site build and native artifact verification. It performs
no database enrollment. Preserve current root/output directories and other
settings from authoritative readback. Selected managed fields: Node22, Express,
`server/index.js`, npm and build script **`build:managed-contributor`**. The script
field is not a shell command. Do not replace the full nullable settings object
with an incomplete example. Normal `npm start` and `build` remain available.

## Full authoritative environment

Hostinger's [current Node API](https://github.com/hostinger/api-python-sdk/blob/main/docs/HostingNodeJSApi.md)
documents `GET .../nodejs/builds/settings/env` as a key inventory with masked
values. `PUT` to that path replaces the complete set, deletes omitted keys and
restarts the process. The request is
[`{"env_vars":[{"key":"NAME","value":"REAL_VALUE"}]}`](https://github.com/hostinger/api-python-sdk/blob/main/docs/HostingV1NodeJsSetBuildEnvVarsRequest.md).
Never use masks as values. Resolve all existing values from the restricted
authoritative store, including unrelated product/foundry/opportunity/payment/mail
settings, and retain the full rollback set. No environment GET/PUT/restart ran here.

Use owner-only regular JSON files (mode0600) outside the release/Git tree.
`--existing` is the full authoritative `{env_vars:[{key,value}]}`;
`--listed` is the fresh GET key inventory; `--overlay` has only contributor
settings. The tool checks exact key coverage and refuses masks, duplicates,
unrelated changes and alteration of stable credentials/durable bindings. It writes
full disabled install/rollback payloads and prints only counts/flags. It has no
network sender or credential generator.

```sh
cd "$SDS_RELEASE_ROOT"
node server/scripts/prepare-contributor-environment.mjs \
  --existing "$RESTRICTED_DIR/sds-authoritative.json" \
  --listed "$RESTRICTED_DIR/sds-env-keys.json" \
  --overlay "$RESTRICTED_DIR/contributor-overlay.json" \
  --install "$RESTRICTED_DIR/sds-install-full.json" \
  --rollback "$RESTRICTED_DIR/sds-rollback-full.json"
```

Serving flags remain `CONTRIBUTOR_JOURNEY_MODE=disabled`,
`CONTRIBUTOR_DESK_MANAGED_ENABLED=0`, `CONTRIBUTOR_JOURNEY_PUBLIC_READS=0`.
Set the exact manifest source commit and future-round array `[]`.

|Setting|Controller-held authoritative input|
|---|---|
|`CONTRIBUTOR_JOURNEY_ORIGIN`|Exact existing HTTPS app origin, selected before enrollment|
|`CONTRIBUTOR_DESK_TRUSTED_PROXY_IPS`|Received concrete nearest-peer IP array|
|`CONTRIBUTOR_JOURNEY_DATABASE_URL`|Restricted genuine PG connection to independent candidate `pilot-retained-host`; never Supabase HTTP auth|
|`CONTRIBUTOR_JOURNEY_STORE_ID`|Stable deployment identifier|
|`CONTRIBUTOR_JOURNEY_EARNED_WORK_SCHEMA`|Isolated schema, e.g. `contributor_work`|
|`CONTRIBUTOR_JOURNEY_CORRESPONDENCE_SCHEMA`|Second distinct isolated schema, e.g. `contributor_correspondence`|
|`CONTRIBUTOR_JOURNEY_REPLAY_KEY`, `INTEGRITY_KEY`, `CURSOR_KEY`|Restricted distinct stable32-byte keys, never regenerated on host switch|
|`CONTRIBUTOR_JOURNEY_OWNER_TOKEN`, `CORRESPONDENCE_ADMIN_TOKEN`|Restricted dedicated service authority|

Short key names in the table have the same `CONTRIBUTOR_JOURNEY_` prefix. Validate
the chosen role/schemas on the candidate before migration. Product/foundry/
opportunity schemas and original221400 authority remain untouched. This package
supplies no actual credential, connection, account, task, requester or recipient.

## Enrollment, verification and recovery

Prepare separate private `preparation.env` with the same resolved store/origin/
stable keys, `MODE=live`, `INSTALLED=1`, public reads0 and empty future bindings.
Serving stays disabled. Existing commands create deployment/reference metadata;
they do not create an account, round or payment:

```sh
node --env-file="$RESTRICTED_DIR/preparation.env" server/scripts/enroll-contributor-journey.mjs migrate
node --env-file="$RESTRICTED_DIR/preparation.env" server/scripts/enroll-contributor-journey.mjs enroll
node --env-file="$RESTRICTED_DIR/preparation.env" server/scripts/enroll-contributor-journey.mjs inspect
node --env-file="$RESTRICTED_DIR/preparation.env" server/scripts/verify-contributor-install.mjs
```

Root receives exact installed source, durable enrollment and the concrete HTTPS
edge before separately selecting serving mode/managed flag through its authorized
installation/release process. Human preview approval remains separate for public
UI activation. No sender in this packet flips flags. Later real source bindings
use the existing exact-round/task/requester enrollment. Empty inventory grants
no invented claim; basic account support remains independent of paid proof.

After authorized installation, read back the desk, all manifest URLs, missing
assets404, API JSON, Host/proxy/origin refusals, cookies/CSRF/recovery, root resources
and restart. Verify source/public/release flags; HTTP200 and key inventories are
not live task proof. Back up both schemas together and retain stable keys separately.
Use the source `LIVE-PROFILE.md` dump/restore recipe; restore the same named
deployment/schemas/keys/origin without copying a task or money ledger.

Rollback uses the retained **full real** prior environment and prior exact source
through the existing controller, never GET masks or a partial set. Holding this
preparation keeps serving/public flags disabled and retains enrollment/backup;
never down-migrate stores or overwrite an obligation to retry. No rollback or
provider mutation was executed here. Paid badges remain absent without canonical
settlement, and original221400 email/terms/grants/obligations retain their authority.
