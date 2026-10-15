# SDS deploy inputs (for 243001)

This bundle is the input for the SameDayDesk runtime integration (243001). It holds names and shapes only; it contains no secret values.

**Host:** existing SameDayDesk Hostinger Node 22 app, SameDayDesk base `d8cea059213e`. The start command stays `node server/index.js`.

**Gateway:** mount `/api/machine-gateway`.
- Tarball: neo `7e5078bbf213` `services/machine-gateway/releases/neomorphic-machine-gateway-0.1.0.tgz`, sha256 `730a959d…32d3`.
- Patch: `deploy/samedaydesk.patch` (blob `044d7656`) against `d8cea059`.
- Storage: SQLite state file and tenants file.

**Monitor:** mount `/api/monitor` (proposed).
- There is no committed tarball and no SDS patch yet; 243001 must write the mount adapter.
- Storage: SQLite (`migrations/001.sql`), or an SDS Postgres store port, which is not implemented.

**CLI archive:** served from the neomorphic.io static site, not SDS. sha256 `8dad55d6…728d`.

**Rollback:** `MACHINE_GATEWAY_ENABLED` unset, `MONITOR_ENABLED` unset, `MONITOR_SCHEDULER` unset.

See `inputs.json` for the full shapes, smoke inputs and health checks.

## AE21 U2 status (supersedes the storage lines above)
The SQLite/"proposed" lines above describe the pre-AE18 input bundle and are historical.
The authoritative environment packet is `../env.keys`; `gateway.env.names` and
`monitor.env.names` are checked subsets of it. Both services run on the enrolled
Postgres (`pilot_gateway`, `pilot_monitor`, and `ae19_paid_continuation` for url.extract).
The N2 `runtime.example.json` is accepted by `monitorOptions`: `database`/`host`/`port`
map to the PG store and the SDS listener and are ignored; only `options` applies.
