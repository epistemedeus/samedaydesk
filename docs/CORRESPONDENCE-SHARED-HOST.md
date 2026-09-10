# S51 correspondence shared-host activation (existing SDS Node)

No new subscription. Reuse the Hostinger Node22 process that already runs
`server/index.js`. Correspondence stays **disabled** until root sets env.

## What ships

- Optional mount at `/api/correspondence` (HTTP routes `/healthz` and `/v1/...`)
- Namespaced Postgres schema `pilot_correspondence` (does not rename/delete SDS tables)
- Vendored `@neomorphic/correspondence` 0.1.0 (accepted S44 service, not a rewrite)
- Feature-absent SDS behavior unchanged (checkout, MCP, static, headers)

## Root activation (after review)

1. Confirm Hostinger Node app still starts `node server/index.js` (or `npm start`).
2. Provision or reuse an existing project Postgres. Do not point at an unrelated
   production application schema without a backup.
3. Set only these (Hostinger panel; do not commit secrets):

```
CORRESPONDENCE_DATABASE_URL=postgres://…
CORRESPONDENCE_ADMIN_TOKEN=<24+ char secret>
CORRESPONDENCE_PG_SCHEMA=pilot_correspondence
CORRESPONDENCE_POOL_MAX=4
CORRESPONDENCE_CORS_ORIGINS=https://neomorphic.io
CORRESPONDENCE_TRUST_PROXY=1
CORRESPONDENCE_STORE=postgres
NODE_ENV=production
```

4. Migrate **once** against that URL (from a laptop/VM with the same tree, not
   assumed Hostinger `psql`):

```
export CORRESPONDENCE_DATABASE_URL=postgres://…
export CORRESPONDENCE_PG_SCHEMA=pilot_correspondence
node vendor/neomorphic-correspondence/dist/migrate.js
```

   Re-run is `CREATE IF NOT EXISTS` in the namespaced schema only.

5. Restart the existing SDS Node app. `GET /api/health` must stay 200.
   `GET /api/correspondence/healthz` should report `enabled: true`.

6. Operator CLI `--base-url` must be the **prefixed** address, e.g.
   `https://samedaydesk.com/api/correspondence` (no trailing slash). Saved trial
   state binds that full address. Changing origin or path does not rebind tokens.

7. Closed-pilot create-trial / accept as in correspondence `deploy/DEPLOY.md`,
   using the prefixed base URL.

## Rollback

1. Unset the `CORRESPONDENCE_*` variables on Hostinger and restart SDS.
   Checkout, MCP, static, and `/api/health` remain. Correspondence healthz
   becomes `{ enabled: false, reason: "unconfigured" }`.
2. Rotate `CORRESPONDENCE_ADMIN_TOKEN` and revoke issued grant files.
3. Optionally `DROP SCHEMA pilot_correspondence CASCADE` on the supplied DB
   **after** root confirms no other objects live there. Never drop `public`
   application tables or other schemas.
4. Git: revert the SDS feature branch merge. No DNS/TLS/plan purchase to undo.

## Unhosted until root sets env

The service is compiled and tested locally. Production Hostinger traffic is not
enabled by this branch. Root decides migration/activation from existing
hosting/DB state.

## S58 reviewed runtime boundary

The shared mount accepts only `pilot_correspondence` and a pool size of 1–4.
The packaged migration requires `CORRESPONDENCE_DATABASE_URL`; generic
`DATABASE_URL` is never a migration fallback. A dedicated URL also selects the
namespaced schema in service configuration. Standalone runtime configuration
with only `DATABASE_URL` retains its existing schema default.

Initialization attempts once, then allows exactly one request-triggered retry
after 5 seconds. Concurrent requests share that retry. No timer reconnects in
the background; after a second failure the operator must restart to retry.
Failed initialization closes the acquired pool. Idle pool errors are handled.
Configured health checks perform a bounded store query; a later database outage
returns 503 with `enabled:false`, while other SDS routes stay independent.

Migration uses one transaction and a schema-specific advisory lock. The portable
Postgres acceptance tests require `CORRESPONDENCE_TEST_DATABASE_URL` pointing
at a fresh disposable database; they never borrow a production/generic URL.
Vendored scripts expose only shipped `dist/index.js` and `dist/migrate.js`.
