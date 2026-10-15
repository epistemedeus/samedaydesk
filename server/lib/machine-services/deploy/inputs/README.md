# SDS deploy inputs (for 243001)

This bundle is the input for the SameDayDesk runtime integration (243001). It holds names and shapes only; it contains no secret values.

The active manifest is `inputs.json` (`sds.machine-services.deploy-inputs.v2`). It is regenerated from `../env.keys`, the install contract in `../README.md`, and the extraction contract (`ae19_paid_continuation`, provisioned by migrate only). `gateway.env.names` and `monitor.env.names` are the listener subsets of that manifest. Installer-only grant names and the discovery-log names stay in `inputs.json` and in `../env.keys`; they are not listener subsets.

**Host:** existing SameDayDesk Hostinger Node 22 app, SameDayDesk base `b069bad3abd40b53e826003d924c7f0ac786f856`. The start command stays `node server/index.js`. Preserve all 59 retained environment values. This manifest does not replace caller-closure priors.

**Gateway:** mount `/api/machine-gateway` on Postgres schema `pilot_gateway`. Payments stay `MACHINE_GATEWAY_PAYMENTS_ENABLED=0`. The selected archive is **0.1.2** (`0171af58f67ac845b720ee6d1cf7765cc1a0b4c65c5b258fc1dbd5ea99f5cfb6`). Archives 0.1.0 and 0.1.1 stay byte-for-byte and are not the selected runtime. SQLite is test and development only.

**Monitor:** mount `/api/monitor` on Postgres schema `pilot_monitor`. It is mounted, not proposed. A standalone runtime file's `database`, `host`, and `port` are type-checked and ignored; only `options` applies.

**Extraction:** schema `ae19_paid_continuation` on the same enrolled Postgres. `machine-services:migrate` provisions it. Serving never migrates.

**Rollback:** `MACHINE_GATEWAY_ENABLED=0`, `MONITOR_ENABLED=0`, `MONITOR_SCHEDULER=0`. Keep both service schemas, receipts, and the full retained environment.

## Historical snapshot (not active)

`inputs.historical.json` is the pre-AE18 input bundle (Pilot `ae1d2d22322a95bce0195d28cfb4811dc448b23d`): SQLite storage, a proposed monitor, and gateway patch base `d8cea059213e06d2f263be67f82e498f8052a50f`. Nothing in the install path reads it. The old patch blob `044d7656` targeted that base; the integration was adapted to `b069bad3abd40b53e826003d924c7f0ac786f856`.
