import { existsSync, appendFileSync, mkdirSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Incomplete } from "./locate.mjs";
import { PG_BIN } from "./pins.mjs";

function run(cmd, args, env = {}) {
  return spawnSync(cmd, args, { env: { ...process.env, ...env }, encoding: "utf8" });
}

export function postgresBinariesAvailable() {
  return existsSync(join(PG_BIN, "initdb")) && existsSync(join(PG_BIN, "pg_ctl"));
}

export function requirePostgres() {
  if (!postgresBinariesAvailable()) {
    throw new Incomplete(`postgresql initdb/pg_ctl missing under ${PG_BIN}`);
  }
}

export function startDisposablePostgres() {
  requirePostgres();
  const initdb = join(PG_BIN, "initdb");
  const pgctl = join(PG_BIN, "pg_ctl");
  const dir = mkdtempSync(join(tmpdir(), "w5-d19-pg-"));
  const pgdata = join(dir, "pgdata");
  const socketDir = join(dir, "socket");
  mkdirSync(socketDir, { recursive: true });
  const port = 55000 + Math.floor(Math.random() * 4000);
  const logFile = join(dir, "pg.log");

  const init = run(initdb, [
    "-D",
    pgdata,
    "-U",
    "d19_accept",
    "--auth-local=trust",
    "--auth-host=trust",
    "--locale=C",
    "--encoding=UTF8",
  ]);
  if (init.status !== 0) {
    throw new Incomplete(init.stderr || init.stdout || "initdb failed");
  }
  appendFileSync(
    join(pgdata, "postgresql.conf"),
    `\nport = ${port}\nunix_socket_directories = '${socketDir}'\nlisten_addresses = ''\n`,
  );
  const start = run(pgctl, ["-D", pgdata, "-l", logFile, "start", "-w", "-t", "20"]);
  if (start.status !== 0) {
    throw new Incomplete(start.stderr || start.stdout || "pg_ctl start failed");
  }
  return {
    dir,
    logFile,
    clientConfig: {
      host: socketDir,
      port,
      user: "d19_accept",
      database: "postgres",
    },
    connectionString() {
      const { host, port: p, user, database } = this.clientConfig;
      return `postgresql://${user}@/${database}?host=${encodeURIComponent(host)}&port=${p}`;
    },
    stop() {
      run(pgctl, ["-D", pgdata, "stop", "-m", "fast"]);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
