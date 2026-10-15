# Existing managed SDS Node installation packet

For a machine-only runtime successor, export the exact committed Neo runtime and
use its maintained `export-desk-assets.mjs --rebind-unchanged` mode to check and
retain all 45 desk bytes. Only their manifest source reference changes. The
private host test runner binds its Neo checkout to this received runtime manifest.
A changed runtime/source/manifest requires Root's fresh deployment-bound native
qualification for the actual completed successor build; do not reuse the prior
qualification. Preserve the complete existing 59-key configuration and stable
store/keys, updating only the actual source/build/qualification bindings. Keep
managed API admission 1, assets/public reads 0 and future bindings empty until
Root separately invokes the authorized zero-value private assigned QA sequence.

The chosen path is the existing SameDayDesk Hostinger **Node22/Express** app,
with `server/index.js` as its entry file. It serves `/contribute/`, its private
`/contribute/_assets/` namespace and `/api/neomorphic-contributor-journey` on the
same exact HTTPS origin. Keep the serving configuration disabled. Normal SDS
routes/static resources and both source homepages retain their existing owners.
The merchant Railway project and static Neomorphic hosting are separate.

## Private API receiving before human publication

`CONTRIBUTOR_DESK_MANAGED_ENABLED=1` admits the installed account API through
the received ingress contract. It does not publish human desk assets.
`CONTRIBUTOR_DESK_ASSETS_ENABLED` defaults off: only the exact string `1` with
a valid existing `CONTRIBUTOR_JOURNEY_PUBLIC_REVIEW_REF` mounts `/contribute`,
`/contribute/` and its manifest URLs. Reuse the operator-reviewed human preview's
`review_…` reference; a fixture reference is only synthetic owner QA. Missing,
malformed or whitespace-bearing references and invalid switch values leave all
human desk routes404, without blocking private API receiving. Assets-off never
falls through to the normal SDS SPA or serves a desk redirect.

For Root's private hosted account/session/Origin/CSRF/recovery receiving, use
`MODE=live`, `INSTALLED=1`, `CONTRIBUTOR_DESK_MANAGED_ENABLED=1`,
`CONTRIBUTOR_DESK_ASSETS_ENABLED=0`, `CONTRIBUTOR_JOURNEY_PUBLIC_READS=0`,
the exact source and existing enrolled bindings/stable credentials/empty future
rounds. Select the already received native ingress contract. No human-page review
reference is required while assets and public reads are off. Qualification still
verifies the unchanged artifact pair; asset verification is not publication.

Human assets-on and public-work reads are independent releases. Assets-on does
not enable public-work reads; reviewed live public reads can operate while human
assets are off, with all existing rights/consent/withdrawal controls. The standalone
private TLS diagnostic receiver is unchanged and is not managed-host publication.

This mounting amendment changes the qualification-bound edge bytes. A qualification
issued for the earlier SDS mount must refuse this source. Root receives the new
exact installation/source and fresh actual policy/HTTPS/plaintext/isolation evidence
before issuing its deployment-bound qualification, retaining existing stable keys.
Do not reuse or restamp the earlier qualification/receipts for the new source.

## Portable database trust

The managed deployment includes the already verified public database CA at
`server/certificates/contributor-database-ca.crt`. Set only the owning database
URL's `sslrootcert` to that path, relative to the actual application working
directory; retain the hostname and `sslmode=verify-full`. Receive the actual
authorized TLS connection at the installed working directory. Never carry a
build-VM-only absolute path into deployment or disable certificate verification.

A CA-path change leaves the same database/schemas/origin/stable-key enrollment
intact, but changes the raw URL bound by HTTPS qualification. Root must issue
the successor qualification against that final URL and actual installation;
an earlier URL-bound qualification is not reusable. This public trust asset
contains no database credential and does not alter Foundry or global TLS.

## Transport and remaining provider facts

`server/lib/contributor-managed-mount.js` is called by `createSdsApp` before
host redirects, parsing and SPA fallback. The existing entrypoint owns its
single listener/drain and binds that listener to the contributor transport observer.
The audited loader's stdin-EOF `exit` event uses that same drain/resource closure,
as do SIGTERM/SIGINT; it does not add a server or separate lifecycle.
Both exact manifests and installed dependency versions are
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
Root's October13 13:35:47UTC provider readback establishes the existing Express/
Node22 entrypoint and `build:managed-foundry`, with a completed prior build. It
does not establish the deployed source or Node transport. No provider mutation
or actual domain acceptance is part of this VM export.

Passenger's [reverse binding](https://www.phusionpassenger.com/docs/advanced_guides/in_depth/node/reverse_port_binding.html)
selects the first HTTP listener and binds a Unix socket despite a requested TCP
port. Its [secure-header contract](https://www.phusionpassenger.com/docs/advanced_guides/in_depth/node/secure_http_headers.html)
rejects external `!~` headers; `!~Passenger-Proto` supplies HTTPS authority.
Ordinary XFP can contain client claims and is unsuitable for this native path.

Three explicit managed modes are supported:

- `CONTRIBUTOR_DESK_INGRESS_MODE=trusted-tcp` retains the accepted TCP contract
  (also the compatibility default). `CONTRIBUTOR_DESK_TRUSTED_PROXY_IPS` is a
  received literal-IP JSON array, with no CIDR/wildcard/default trust. The actual
  selected listener must be TCP and the closest peer must supply one overwritten
  XFP=`https`. Native-looking `!~` headers are refused. No Unix loopback-address
  getter counts as a TCP peer. Physical direct TLS retains its verified route.
- `CONTRIBUTOR_DESK_INGRESS_MODE=passenger-native` requires proxy IPs `[]` and
  the audited loaded Passenger main module, its matching runtime export and
  installed listen hook, the same selected HTTP server, matching actual Unix
  address and an actual request socket belonging to that listener. Exactly one
  raw `!~Passenger-Proto` must equal `https`. Flags, fabricated globals/loaders,
  TCP requests and missing/duplicate/wrong markers grant no authority. No XFP
  fallback exists. Ordinary forwarding claims are ignored and discarded.
- `CONTRIBUTOR_DESK_INGRESS_MODE=litespeed-https-only` requires empty TCP peers,
  the controller's signed/current qualification of the exact deployment's
  HTTPS-only policy and backend isolation, and its real selected Unix pipe and
  qualified loader identity. No forwarded claim supplies TLS authority. See
  [LITESPEED-HTTPS-ONLY.md](LITESPEED-HTTPS-ONLY.md) for received actual facts,
  remaining plaintext/bypass checks and exact installation/change invalidation/rollback.

The audited [upstream Node loader](https://github.com/phusion/passenger/blob/c2fde75b26ced690978167e882d3da440188591f/src/helper-scripts/node-loader.js)
is SHA256 `8fa9ce29cc2b098d03d16027d8f923f10e1d78c26727b5b248138d093acb02d8`.
Unknown/modified loaders refuse the native prefix until their exact owning source
is audited; an environment assertion cannot add a loader. No VM path is pinned.
Tests invoke this unchanged hook and real Unix sockets, with a simulated TLS
terminator/Passenger core. They do not qualify actual Hostinger transport.

The product boundary is received HTTPS-only ingress, exact origin/Host, secure
cookies and CSRF, not a particular Passenger helper/header. A different supported
edge can meet it through authenticated per-request TLS evidence or independently
received TLS-only enforcement before the application and isolated backend access.
Neither Unix locality, helper fingerprints, environmental assertions nor ordinary
forwarding values establish that policy. The source implements the three
contracts above plus direct TLS. The LiteSpeed mode stays unavailable until the
controller receives and signs that external deployment contract; source fixtures
and the existing GET redirects cannot do so.

Root's exact [current receiving](https://github.com/epistemedeus/pilot/blob/47be8f5856a0a783ef11d23d2f4fba98cc68ee47/overview/research/phase-20261013/contributor-live-profile-229500/ROOT-NATIVE-RECEIVING-230010.md)
records a completed e25b1ed4 build and one real disabled probe: `node`,
`unix-selected`, native marker missing, exact Host true. That negative is preserved.
It neither identifies the actual helper nor establishes a supported HTTPS-only
edge; the existing native guard correctly refuses. Root removed all probe settings.

Root's subsequent16:19:26.546UTC v2 receipt identifies the actual LiteSpeed
helper/native pipe and absent native marker; provider SSL/forced HTTPS and plain
GET redirects are received. [LITESPEED-HTTPS-ONLY.md](LITESPEED-HTTPS-ONLY.md)
owns the precise remaining plaintext mutation/bypass receiving and qualification
packet. The upstream helper differs from the deployed bytes and is not copied
or called an audited live source. The v2 observation now includes one additional
non-secret boolean, `litespeedGlobalIsEventEmitter`, for the runtime identity check
on the exact candidate. It still grants no authority. Candidate path remains
`https://samedaydesk.com/contribute/` with exact origin/cookies/CSRF and no new host.

Malformed Host/origin is refused. Account limits use the socket's conservative
shared-edge identity, never secure or ordinary forwarded client addresses. Keep
`CONTRIBUTOR_JOURNEY_TRUST_PROXY=0`; origin/CSRF and `__Host-neo_contributor`
Secure/HttpOnly/SameSite=Strict/Path=/ cookies remain exact. Receiving uses an
explicit CA with certificate verification; HTTP is only the inner managed hop.

## Source and build installation

Root receives the exact Neo/SDS commits from the successor Pilot receipt and uses
the existing release process. Branch names are not admission. Both artifact
manifests must name the same Neo commit as `CONTRIBUTOR_JOURNEY_SOURCE_COMMIT`.
When that variable is absent, `build:managed-contributor` derives it from the
checked-in runtime and desk manifests and refuses if they disagree. A value
that is set and does not match those manifests is still refused. Hostinger
serves compiled artifacts without a Neo checkout, Astro or TS loader.

The `build:managed-contributor` package script composes the existing
`build:managed-foundry` with native contributor artifact verification. This
retains locked SDS client dependencies, its single normal site build, deployable
Python/Wasmtime materialization and the Foundry managed capability probe. It
performs no database enrollment or installation. Use this script for the frozen
candidate build while preserving Express, Node22, `server/index.js`, npm,
root/output directories and existing auto-deployment linkage. Normal `npm start`,
`build` and `build:managed-foundry` remain available. A per-build selection does
not require a saved-settings PUT for this probe packet.
Root's actual API receiving found that a build selection changes Git linkage.
After every terminal candidate build, read back and restore the complete original
enabled `main` linkage through Root's existing controller. No source reset or
partial settings/environment replacement is implied.

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

Preparation flags remain `CONTRIBUTOR_JOURNEY_MODE=disabled`,
`CONTRIBUTOR_DESK_MANAGED_ENABLED=0`, `CONTRIBUTOR_DESK_ASSETS_ENABLED=0`,
`CONTRIBUTOR_JOURNEY_PUBLIC_READS=0`.
Set the exact manifest source commit and future-round array `[]`.

|Setting|Controller-held authoritative input|
|---|---|
|`CONTRIBUTOR_JOURNEY_ORIGIN`|Exact existing HTTPS app origin, selected before enrollment|
|`CONTRIBUTOR_DESK_INGRESS_MODE`|Received `trusted-tcp` or audited `passenger-native`; serving remains off|
|`CONTRIBUTOR_DESK_TRUSTED_PROXY_IPS`|Concrete received TCP peer array, or `[]` for native Unix|
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

## One-request private actual-host diagnostic

Root owns installation and the existing app's authenticated runtime-log API.
This diagnostic changes no response and creates no endpoint. It observes only
`GET /api/health` with exactly one matching `X-Contributor-Native-Probe` nonce,
while `MODE=disabled`, managed0 and public reads0. The absolute expiry is at most
10minutes from process startup; it emits at most one receipt per process. Restarts
do not extend expiry. Default/invalid/expired scope and disabling the probe restore
normal health behavior. There is no poller, daemon or second listener.

1. Independently receive the exact successor sources/artifacts. Keep the selected
   build/settings and **full** authoritative environment/rollback in restricted
   mode0600 files. Add these contributor-only overlay values through the existing
   `prepare-contributor-environment.mjs` command above, retaining all stable
   credentials, enrolled origin/store/schemas and other products' settings:

   ```text
   CONTRIBUTOR_JOURNEY_MODE=disabled
   CONTRIBUTOR_DESK_MANAGED_ENABLED=0
   CONTRIBUTOR_JOURNEY_PUBLIC_READS=0
   CONTRIBUTOR_DESK_NATIVE_PROBE=1
   CONTRIBUTOR_DESK_NATIVE_PROBE_VERSION=2
   CONTRIBUTOR_DESK_NATIVE_PROBE_NONCE=CONTROLLER_OPAQUE_32_TO_128_BASE64URL_CHARACTERS
   CONTRIBUTOR_DESK_NATIVE_PROBE_EXPIRES=CONTROLLER_ABSOLUTE_UTC_ISO_EXPIRY_WITHIN_10_MINUTES
   ```

   The nonce is a short-lived diagnostic correlator, never an account or stable
   signing key. Root sends the prepared **full real** environment through its
   existing authorized installer, preserving key inventory and allowing its
   normal restart. This builder makes no provider call. Preparing this overlay
   does not migrate/enroll anything or select a serving mode.
2. Use a separate owner-only `native-probe.env` with just those disabled probe
   settings and the same exact `CONTRIBUTOR_JOURNEY_ORIGIN`. After installation,
   make exactly one request, with system certificate verification:

   ```sh
   node --env-file="$RESTRICTED_DIR/native-probe.env" server/scripts/probe-contributor-native-ingress.mjs
   ```

   Version2 sends the configured exact Origin as a diagnostic input, which grants
   no authority. This finite client sends no cookie/body and follows no redirect; TLS/health
   failures return a bounded refusal. Its digest/health success requires private
   log readback and explicitly **does not accept native ingress**.
3. Read the existing app's authenticated
   `GET /api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/runtime-logs?period=1h&limit=200`
   once through Root's existing Hostinger authority. The
   [official runtime-log reader](https://github.com/hostinger/api-python-sdk/blob/main/docs/HostingNodeJSApi.md#get_node_js_runtime_logs_v1)
   parses JSON timestamp/level/message entries, which this probe emits. Retain
   only the v2 message beginning `contributor_native_ingress_probe ` whose
   `controllerNonceSha256` matches the client's digest and timestamp belongs to
   this installation. Do not publish other runtime entries or clear shared logs.
   The actual API returns an object containing `logs`; Hostinger may additionally
   wrap this application's JSON envelope inside an entry's `message`. Validate
   and unwrap both typed envelopes before schema/digest/time matching, as Root's
   current receiving does. Do not treat a zero match or shape refusal as a pass.
   Missing receipt is a useful negative, not an instruction to keep polling.
4. Schema `sds.contributor-native-ingress-probe.v2` retains the prior runtime/
   listener/native marker/Host facts and adds selected-server/request booleans,
   physical address/native-handle enums, bounded main/helper presence/content
   SHA256 and listen/address hook fingerprints/facts. Module labels/globals are
   observations, never qualification. The native address call bypasses a helper's
   virtual `server.address()`; fd-backed cases may be `unknown` with a `pipe` handle.
   Standard XFP/Forwarded/X-Forwarded-SSL/Front-End-HTTPS appear only as counts and
   allowlisted enums, with exact configured-origin/present/match booleans. Counts2
   mean multiple. No raw source, filename/path/socket bytes, IPs, headers, cookies,
   body, credentials, unrelated environment or customer records are logged.
   `observation.authorityAccepted` is always false: this identifies facts for the
   next received contract, never a serving gate. The v1 diagnostic/default and
   its original exact assertions remain compatible when VERSION is omitted.
5. Restore the complete prior authoritative disabled environment, or prepare a
   full cleanup set with probe0 and version/nonce/expiry removed. Preserve the current
   settings/source and enrollment; use prior exact source only for a code rollback.
   Root performs any environment replacement/restart. Remove its private nonce
   files after readback; retain the sanitized receipt. Expiry also stops observation
   without a timer. No runtime-log deletion, store restore/key rotation, serving
   activation or public release follows from this diagnostic.

## Enrollment, verification and recovery

Root has already enrolled stable credentials/schemas and received an empty
real-store/Unix-only restore at229870. This transport amendment must reuse them;
do not rerun enrollment or regenerate anything merely to install the probe.
For a later independently authorized host, use separate private `preparation.env` with the same resolved store/origin/
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

After authorized private installation, read back every desk/manifest URL404,
API JSON, Host/proxy/origin refusals, cookies/CSRF/recovery, root resources and
restart. After separate human preview approval and explicit assets-on, read back
all manifest bytes and missing assets404. Verify source/public/release flags; HTTP200 and key inventories are
not live task proof. Back up both schemas together and retain stable keys separately.
Use the source `LIVE-PROFILE.md` dump/restore recipe; restore the same named
deployment/schemas/keys/origin without copying a task or money ledger.

Rollback uses the retained **full real** prior environment and prior exact source
through the existing controller, never GET masks or a partial set. Holding this
preparation keeps serving/public flags disabled and retains enrollment/backup;
never down-migrate stores or overwrite an obligation to retry. No rollback or
provider mutation was executed here. Paid badges remain absent without canonical
settlement, and original221400 email/terms/grants/obligations retain their authority.

## Optional reviewed public composition

The managed guard accepts `CONTRIBUTOR_JOURNEY_PUBLIC_READS=1` only for live
composition with an explicit `CONTRIBUTOR_JOURNEY_PUBLIC_REVIEW_REF`. The compiled
producer validates it again. Default is0. That reference does not establish
human approval, publish a summary or turn an original-holder link into a source.
Exact current requester rights clearance, contributor consent and withdrawal
still fence every preview/list/discussion/share derivative. Root owns release.

A server-owned `canonicalReceiving` read port can be supplied to
`createSdsApp({neomorphicContributorJourney:{env,canonicalReceiving}})` and reaches
the default compiled runtime. Replacement service loaders/modules/business ports
remain forbidden. The canonical owner independently receives the exact existing
task-family acceptance/allocation authority and receipt observer; absent/unknown
proof omits the badge. No payment/IOU writer or environment module loader is added.
Private useful/effort measurement remains a server-side producer/reader.

## Focused source regression replay

After locked SDS and Neo root/service installs and the Neo runtime build, run:

```sh
CONTRIBUTOR_JOURNEY_TEST_NEO_ROOT=/absolute/isolated/neo \
CONTRIBUTOR_JOURNEY_TEST_CHROME=/absolute/remote/chrome \
node server/scripts/test-contributor-private-host.mjs
```

The runner requires exact Neo44d12c51 and installed PostgreSQL16/Chrome. It copies
only received contributor test fixtures into disposable scratch and adds explicit
reviewed assets to the older managed fixture profile. Its legacy both-prefix
public-config negative uses an invalid read switch, retaining every original
assertion. The appended matrix separately requires API503/desk404 for absent
public review. It appends SDS-owned private mounting regressions and replays compiled
native/Unix/TLS accounts plus installed/public/original-holder journeys. Neo
tracked source and both production artifact manifests remain unchanged. Owned
fixture services, PostgreSQL and scratch are closed/removed by their existing
lifecycle and the runner; this does not receive the actual hosted domain.
