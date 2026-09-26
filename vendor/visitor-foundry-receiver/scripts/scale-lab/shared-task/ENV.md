# S20 shared-task — deployment / env contract

Uses the **existing** `services/correspondence` package. No new payment rail, hosted bill, or second event store.

## Required (shared mode)

| Variable | Where | Notes |
| --- | --- | --- |
| `CORRESPONDENCE_ADMIN_TOKEN` | correspondence process | ≥24 chars; bootstrap only |
| `DATABASE_URL` | correspondence process | Postgres; apply `migrations/001_init.sql` via `npm run migrate` |
| `PORT` | correspondence process | default `8787` |
| `CORRESPONDENCE_CORS_ORIGINS` | correspondence process | Exact browser origins allowed (include port). Empty = none. |

## Optional (this lab / tests)

| Variable | Notes |
| --- | --- |
| `CORRESPONDENCE_TEST_DATABASE_URL` | Disposable local Postgres for S20 dual-client tests |
| `CORRESPONDENCE_STORE` | `postgres` (default) or `memory` only when `NODE_ENV=test` |

## Local disposable fixture (this Cursor VM)

```sh
# Postgres already provisioned for the closed pilot:
#   postgres://correspondence:correspondence@127.0.0.1:5432/correspondence_test
cd services/correspondence && npm run build
node scripts/start-correspondence-fixture.mjs
```

Static site remains Hostinger-compatible; correspondence stays a separate Node process (see `services/correspondence/deploy/DEPLOY.md`).

## Privacy-safe observability

- Health: `GET /healthz` → `{ ok, store }` only
- Do not log bearer tokens, admin secrets, or raw grant material
- Artifact URLs are stored as references and never fetched by the service
- Event text is data; no execution hooks

## Non-goals

No public OAuth, email outbox, custody/escrow, fake multi-client stubs, or demand claims from fixtures.
