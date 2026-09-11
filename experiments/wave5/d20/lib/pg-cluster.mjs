import { appendFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PG_BIN } from "./pins.mjs";

function bin(name) {
  return join(PG_BIN, name);
}

export function postgresBinaries() {
  return {
    initdb: bin("initdb"),
    pg_ctl: bin("pg_ctl"),
    present: existsSync(bin("initdb")) && existsSync(bin("pg_ctl")),
  };
}

export function startDisposableCluster() {
  const bins = postgresBinaries();
  if (!bins.present) {
    throw new Error(
      `PostgreSQL binaries missing at ${PG_BIN} (initdb/pg_ctl). This is incomplete coverage, not a skip.`,
    );
  }
  const dir = mkdtempSync(join(tmpdir(), "w5-d20-pg-"));
  const pgdata = join(dir, "pgdata");
  const logFile = join(dir, "pg.log");
  const port = 55100 + Math.floor(Math.random() * 4000);
  const init = spawnSync(
    bins.initdb,
    ["-D", pgdata, "-U", "outbox", "--auth-local=trust", "--auth-host=trust"],
    { encoding: "utf8" },
  );
  if (init.status !== 0) {
    throw new Error(`initdb failed: ${init.stderr || init.stdout}`);
  }
  appendFileSync(
    join(pgdata, "postgresql.conf"),
    `\nport = ${port}\nlisten_addresses = '127.0.0.1'\n`,
  );
  const start = spawnSync(bins.pg_ctl, ["-D", pgdata, "-l", logFile, "start", "-w"], {
    encoding: "utf8",
  });
  if (start.status !== 0) {
    throw new Error(`pg_ctl start failed: ${start.stderr || start.stdout}`);
  }
  return {
    dir,
    pgdata,
    port,
    connectionString: `postgres://outbox@127.0.0.1:${port}/postgres`,
    stop() {
      spawnSync(bins.pg_ctl, ["-D", pgdata, "stop", "-m", "fast"], { encoding: "utf8" });
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
