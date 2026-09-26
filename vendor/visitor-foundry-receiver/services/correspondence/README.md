# Project correspondence service

Standalone Express + Postgres package implementing the Neomorphic correspondence HTTP contract. It is not part of the static Astro `dist/` publish boundary and is not served from Hostinger static hosting.

## Boundaries

- Transports project requests, replies, corrections, and artifact references.
- Does not execute instructions, authorize purchases, issue credentials, or fetch artifact URLs.
- Closed-pilot administrator provisioning only. No public OAuth.
- Grant and replay records store token hashes, never plaintext owner tokens.
  For 24 hours, authenticated bootstrap retries reconstruct the same owner token
  using a purpose-separated HMAC of the bootstrap secret and idempotency key.
  Keep the bootstrap secret outside the database. After that window, or after
  bootstrap-secret rotation, retry returns409 `bootstrap_recovery_required` and
  preserves the original project. It never silently creates another project.
  A surviving owner grants new access; if the initial response was lost, an
  administrator must reconcile the original project and rotate its owner grant
  in the private store. Do not repeat create with a new key to hide the outcome.
- No email outbox, callbacks, model daemon, public feed, or payment authority.

## Configuration

| Variable | Required | Notes |
| --- | --- | --- |
| `CORRESPONDENCE_ADMIN_TOKEN` | yes | High-entropy bearer for `POST /v1/projects` |
| `DATABASE_URL` | yes in production | Postgres connection string |
| `CORRESPONDENCE_DATABASE_URL` | yes if `DATABASE_URL` unset | Same as `DATABASE_URL`; preferred when sharing a host/process |
| `CORRESPONDENCE_PG_SCHEMA` | no | Standalone default `public`. Shared-host mount should set `pilot_correspondence` |
| `CORRESPONDENCE_POOL_MAX` | no | Bounded `pg.Pool` size 1–8, default 4 |
| `CORRESPONDENCE_STORE` | no | `postgres` (default) or `memory` (tests only) |
| `NODE_ENV` | yes for memory | Must be `test` when using the memory store |
| `PORT` | no | Default `8787` |
| `CORRESPONDENCE_CORS_ORIGINS` | no | Comma-separated canonical browser origins (`https://host[:port]` or explicitly listed `http://host[:port]`). Unset allows `https://neomorphic.io` only. Empty string allows none. Loopback is not implied; list `http://127.0.0.1:4321` (or similar) when a closed-pilot browser origin must call this process. Invalid entries (path, userinfo, query, fragment, `null`, non-http(s)) refuse to start. |
| `CORRESPONDENCE_TRUST_PROXY` | no | Integer hop count 0–5 for Express `trust proxy`. Default `0` (ignore `X-Forwarded-*`). Set `1` only behind a known TLS proxy. Boolean `true` is rejected. |

Copy `.env.example` locally. Do not commit secrets.

Optional shared-host mount: the Express app remains rooted at `/healthz` and `/v1`. A host may `use("/api/correspondence", app)` without rewriting routes. CLI `--base-url`, saved trial state, OpenAPI server URL, and client `baseUrl` must then include that prefix. An origin or path change does not rebind a saved token. CORS stays exact-origin (no path, no host-global wildcard).

## Commands

```bash
cd services/correspondence
npm ci
NODE_ENV=test CORRESPONDENCE_STORE=memory CORRESPONDENCE_ADMIN_TOKEN=test-admin-token-please-change npm test
npm run build
DATABASE_URL=postgres://... CORRESPONDENCE_ADMIN_TOKEN=... npm run migrate
DATABASE_URL=postgres://... CORRESPONDENCE_ADMIN_TOKEN=... npm start
```

## Persistence

Apply `migrations/001_init.sql` before serving traffic. Production must use Postgres. The memory adapter is test-only and refused outside `NODE_ENV=test`.

Persistence tests require `CORRESPONDENCE_TEST_DATABASE_URL` explicitly; they do
not consume a production `DATABASE_URL`. The final nonempty event page includes
`nextCursor` even when no more events exist yet. Keep that cursor across an empty
page and use it to resume after later events. Treat it as opaque and project-scoped.
Unauthenticated admission is per connection IP with bounded expiring buckets;
the default app does not trust forwarded IP headers. Configure any reverse proxy
deliberately before exposing this closed-pilot service to broader traffic.

## OpenAPI

`openapi.json` describes the implemented routes and error shapes.

## Closed-pilot operator tools

```bash
npm run pilot-trial -- create-trial --base-url URL --admin-token-file PATH --state-file PATH
npm run accept:closed-pilot   # local disposable PG or remote HTTPS; see deploy/DEPLOY.md
```

Operator state and token files must be regular, non-symlink files with mode
0600. Project creation records its immutable origin, payload, and idempotency
key before the request. Commands using saved state reject a different origin
before reading a token; an unknown grant result is not retried automatically.

Deployment sequence and rollback: `deploy/DEPLOY.md`.
