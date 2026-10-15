# Existing-host installation

SDS adaptation: use [the integrated Postgres install package](../../../lib/machine-services/deploy/README.md).
The historical upstream SQLite recipe below is retained for provenance/local use;
the actual SDS mount selects Postgres and rejects production SQLite.

This is an executable deployment configuration for the existing SameDayDesk
Hostinger Node 22 process. No new plan, paid service, wallet or funded test is
needed. Nothing here changes the static Neomorphic host or publishes a human
offer. This branch has not been deployed.

The existing host and prefix-mount pattern were inspected at SameDayDesk
`d8cea059213e06d2f263be67f82e498f8052a50f`. `samedaydesk.patch` is the focused
host integration diff against that SHA: mount before the global JSON parser,
then close the store after the existing listener lifecycle drains requests.
Review/rebase that diff if the host has advanced. Do not change unrelated host
services or their configuration.

## Prepare the exact release

On the operator VM, from this feature checkout:

```sh
flock /home/ubuntu/.cache/pilot-ae18-build.lock npm ci --ignore-scripts --no-audit --no-fund --prefix services/machine-gateway
flock /home/ubuntu/.cache/pilot-ae18-build.lock npm run check --prefix services/machine-gateway
flock /home/ubuntu/.cache/pilot-ae18-build.lock npm test --prefix services/machine-gateway
flock /home/ubuntu/.cache/pilot-ae18-build.lock npm pack ./services/machine-gateway --ignore-scripts --pack-destination /tmp
```

The package is `neomorphic-machine-gateway-0.1.0.tgz`. It includes the runtime,
schemas, MIT source notices, and **npm-shrinkwrap.json**. It excludes fixtures,
test credentials, state files and other repository packages. `npm ci` uses that
shipped dependency lock. Record the archive SHA-256 with the deployment commit.

In an operator-owned SameDayDesk staging checkout (never an unrelated live
worktree), with the archive and patch available:

```sh
mkdir -p server/vendor/neomorphic-machine-gateway
tar -xzf /tmp/neomorphic-machine-gateway-0.1.0.tgz --strip-components=1 -C server/vendor/neomorphic-machine-gateway
flock /home/ubuntu/.cache/pilot-ae18-build.lock npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix server/vendor/neomorphic-machine-gateway
git apply --check /absolute/gateway-checkout/services/machine-gateway/deploy/samedaydesk.patch
git apply /absolute/gateway-checkout/services/machine-gateway/deploy/samedaydesk.patch
```

The host still starts `node server/index.js`; the mount opens **no extra port**.
When the gateway is disabled or misconfigured, only its prefix returns 503.
Raw webhooks, host health, other optional mounts and the SPA retain their routes.

## Bind existing durable storage and enroll a free caller

Choose a canonical absolute directory on the host's **existing durable local
disk**, outside any replacement build/output tree. Keep it across deployments
and restarts, accessible only to the Node service UID. SQLite WAL is not an NFS
or multi-host database; use one existing Node replica. The service rejects
symlinked, shared-permission or hard-linked state/config files. There is no
ephemeral-store fallback. If this host cannot retain a local directory, leave
the prefix disabled; this change does not provision storage or purchase a plan.

Set `GATEWAY_STATE_DIR` to that existing operator-selected directory. These are
operator commands, not actions executed against production by this branch:

```sh
install -d -m 700 "$GATEWAY_STATE_DIR"
node server/vendor/neomorphic-machine-gateway/bin/enroll.mjs \
  --tenant first-caller \
  --config "$GATEWAY_STATE_DIR/tenants.json" \
  --token-file "$GATEWAY_STATE_DIR/first-caller.credential" \
  --max-calls 1000
```

Enrollment writes a random bearer to a new mode-0600 file and stores only its
SHA-256 in the tenant configuration. It prints no bearer. Transfer that private
file to its intended caller using the existing credential channel. Run one
enrollment at a time. Route scopes initially allow only the two free built-ins,
with a zero payment budget and at most two concurrent calls.

Load `hostinger.env.example` into the existing Hostinger application environment,
substituting the same canonical absolute paths. Keep
`MACHINE_GATEWAY_PAYMENTS_ENABLED=0`. Retain other host variables and the current
start command. The concrete operator activation is to publish the reviewed host
integration through its existing deployment workflow and restart that one Node
application. This feature branch does not execute that production step.

## Readiness and cold caller commands

After the existing host deployment:

```sh
node server/vendor/neomorphic-machine-gateway/bin/readiness.mjs \
  --base-url https://samedaydesk.com/api/machine-gateway
```

This verifies the mounted health/discovery contracts and a labeled free test
fixture. It explicitly reports `authenticatedExecutionVerified:false` and
`livePaymentVerified:false`; it is not a paid-launch or customer-use claim.

For actual free work, create `input.json` with either
`{"url":"https://neomorphic.io/.well-known/security.txt"}` for `http.capture`, or
`{"before":"<npm lockfile JSON text>","after":"<npm lockfile JSON text>"}` for
`lockfile.delta`. The lockfile engine accepts npm versions 2/3 and at most 256
pins per side. Use absolute paths for credentials and saved caller state:

```sh
node server/vendor/neomorphic-machine-gateway/bin/caller.mjs \
  --base-url https://samedaydesk.com/api/machine-gateway \
  --token-file /private/caller.credential --state-file /private/caller-state.json \
  --route http.capture --input-file /private/input.json
node server/vendor/neomorphic-machine-gateway/bin/caller.mjs \
  --base-url https://samedaydesk.com/api/machine-gateway \
  --token-file /private/caller.credential --state-file /private/caller-state.json --resume
```

The caller saves its quote, exact input and idempotency key **before** execution,
then compares authenticated persisted readback. A new invocation resumes the
same purchase after lost acknowledgment. Origin, prefix, credential and input
changes fail the saved binding. This small service caller supports free work
only and does not overlap the shared Neomorphic CLI owner's integration.

Read the same receipt after a controlled restart of the existing application.
Verify existing `/api/health`, webhooks' ordinary parser behavior and the public
site independently. Root may then integrate actual observed availability into
the dedicated machine manifest and coordinate the reserved human status copy.

## Payment boundary and extending the registry

The initial production configuration has no paid route and no funded action.
To add a provider, supply a deployment-owned `RouteRegistry` to
`mountMachineGateway(app, { registry, paymentAdapter })`. Register closed input
and output schemas, an immutable revision, timeout, output cap, handler, pure
test fixture and integer price in the registry's single budget unit. Change the
revision when handler semantics change. Pass the abort signal to all IO.
Never accept caller-selected modules, upstream secrets, facilitator URLs or
unrestricted proxy targets. Network providers should reuse the pinned public
transport or a deployment-owned allowlist with equivalent DNS pinning.

For an already-enrolled exact-EVM x402 integration, pass its existing
`HTTPFacilitatorClient` to `existingFacilitatorAdapter({ client, budgetUnit,
network, asset, payTo })` and bind those same requirements to the route. The
adapter reuses SDK 2.16.0 and the enrollment's operation-specific auth headers
in a bounded worker. Worker-local transport forbids redirects, caps facilitator
responses at 16 KiB and closes sockets on deadline/abort. It never changes the
host-global fetch or signs a payment. The initial adapter supports the declared
minimal EIP-3009 v2 payload and optional resource/payment-identifier metadata;
other rails/extensions require a reviewed adapter, not permissive parsing.

Possible spend is durable before SDK entry. Ambiguous results reserve the
full amount permanently and forbid another payment for the same quote or
authorization identity. A nonce is reserved globally only after verification
succeeds, so an invalid signature cannot poison another tenant's authorization.
This branch's payment tests are unsigned local
fixtures only. Live funded acceptance is outside this task and was not run.

## Operations and rollback

Limits are lifetime tenant calls/spend, four global executions, tenant-configured
concurrency (1–4), 128 KiB request JSON, a 3-second body deadline, 60-second
quotes, provider deadlines (up to 30 seconds), and 10,000 retained receipts.
Public ingress defaults to 120 requests/minute per direct socket address;
forwarded IPs are not authority. On a shared reverse proxy that is effectively
a gateway-wide ceiling. Raise it only through reviewed mount configuration.
Quote capacity is 2,000 unused quotes; expired unused quotes are removed.
Receipts and payment identities are never automatically deleted. Plan disk
capacity for retained output and take a SQLite online backup or stop/drain the
service before copying the database and WAL. Do not copy only the main file
while it has a live WAL. Preserve tenant IDs, the entire database and receipt
history across credential rotation and deploys; changing a tenant ID resets
that tenant's budget authority and is a deliberate new enrollment.
Tenant configuration is read at gateway initialization. Remove or rotate its
token hash and restart the existing application to revoke a credential; preserve
the tenant ID and database so limits and authorized receipts remain bound.

After a crash, in-progress receipts stay `running` until the persisted deadline,
then become `uncertain` on read/retry. No work or settlement restarts. An abort
cannot undo a provider-side effect already sent; uncertainty stays visible.
The existing SDS listener has a four-second forced shutdown limit; an operation
interrupted by that host deadline follows the same persisted uncertainty path.
This patch does not extend or replace another service's shutdown policy.
Known failures before possible settlement release spend reservations. Possible
or confirmed settlement does not. Call admission remains counted in all cases.
There is no automatic repair that manufactures a replacement payment.

To roll back, set `MACHINE_GATEWAY_ENABLED=0` and restart through the existing
host workflow. Keep the database and tenant files for readback/reconciliation
when re-enabled. A code rollback may remove the optional mount patch; it must
not remove or overwrite another service's data, migrations, jobs or listeners.
