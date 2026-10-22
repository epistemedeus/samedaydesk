# VF17 host qualification

Synthetic host qualification for the existing SDS254 receiving owner. A private Postgres cluster, shaped like the VF11 `privatePG` harness, is started on `127.0.0.1`, measured, and removed. Offered client counts are **1, 8, 32, and 128**. The axes are concurrency, corpus size, and backlog depth.

The cluster keeps the VF11 envelope: `max_connections=24`, `shared_buffers=32MB`, `work_mem=2MB`, fsync and synchronous commit on, SCRAM for TCP, no unix socket, and no caller database URL. Offered clients log in as `vf17_client` (`NOSUPERUSER`). Counts that exceed the non-superuser slots are recorded as **limited** with both the requested and actual sizes. The harness does not shrink the offer and then call it qualified.

Each offered client is attempted once, one attempt at a time, so a refused backend is gone before the next attempt. Sessions that connect stay open together, and that held set runs the measured work. Corpus load is 8 rows of 256 bytes per offered client. Backlog depth is 4 queued items per offered client, drained with `FOR UPDATE SKIP LOCKED`. Three seeded rows (empty body, negative slot, backlog state `live`) must fail SQLSTATE `23514` before any measured cell.

This directory is the only write scope. The SDS254 pin is read-only intake context. Nothing here deploys, changes a plan, or sends live traffic.

## Pins

| Role | Ref |
| --- | --- |
| SDS254 | `39a1ed7ceff813e9f490bd399fcea30f3451a53b` |
| Neo receiver | `1652533b1823ac33b86591ec4e931a8c4ea4aa97` |
| VF11 export | `14fef551e4d13e2ccd95d0fb049c19d13404a5ac` |
| Repo base | `622d82e50dd4430610e92138f1d3b3aa69fd8ac4` |

PostgreSQL 16 binaries are required. Set `VF17_PG_BIN` when they are not in `/usr/lib/postgresql/16/bin`. `VF11_PG_BIN` is also accepted.

## Commands

```sh
npm --prefix experiments/vf17-host-qualification install
node --test experiments/vf17-host-qualification/test/reject.test.mjs
node experiments/vf17-host-qualification/cli.mjs reject-seed --fixture experiments/vf17-host-qualification/fixtures/seeded-foreign-database-url.json
node experiments/vf17-host-qualification/cli.mjs run
node experiments/vf17-host-qualification/cli.mjs summary --input experiments/vf17-host-qualification/evidence/qualification.json
node experiments/vf17-host-qualification/cli.mjs compare --baseline experiments/vf17-host-qualification/evidence/qualification.json --input experiments/vf17-host-qualification/fixtures/seeded-incomplete-aggregate.json
node --test experiments/vf17-host-qualification/test/*.test.mjs
```

`reject-seed` exits 1 when the fixture is refused. `compare` against the shortened plan exits 1. `run` exits 0 only when every seeded SQL rejection fired and every cell is `qualified` or `limited`.

## SDS254 intake

`aggregate/sds254-owner-intake.json` is the machine-readable aggregate. `admissibleOfferedClients` are counts whose concurrency, corpus, and backlog cells are all `qualified`. `limitedOfferedClients` kept the full offer in the record and acquired fewer sessions. The cited foundry pool math (one web process plus one worker = 10 connections; two webs at the base max plus one worker = 22; envelope 24) is copied from `server/foundry/PINS.json` and `docs/FOUNDRY-HOST-RECEIVER.md` on this repo base. It is not a Hostinger measurement.
