# S51 shared-host overlay

See SameDayDesk `docs/CORRESPONDENCE-SHARED-HOST.md` for Hostinger Node activation
on the existing SDS process. This overlay:

- Allows CLI/client `--base-url` / saved state to include `/api/correspondence`
- Namespaces Postgres via `CORRESPONDENCE_PG_SCHEMA` (default `public` standalone)
- Bounds `pg.Pool` (`CORRESPONDENCE_POOL_MAX`, default 4)
- Exports `createApp` / `createPostgresStore` / `loadConfig` for SDS mount
- Does not change standalone `/healthz` + `/v1` route shape

Do not merge this orphan Neo tree into Pilot main.

S58: shared mode requires schema `pilot_correspondence`, pool <=4 and the dedicated
`CORRESPONDENCE_DATABASE_URL`. The migration CLI accepts only that dedicated URL
and namespace, including when generic `DATABASE_URL` is set. The existing
standalone runtime may still use generic `DATABASE_URL` and `/v1` routes.
