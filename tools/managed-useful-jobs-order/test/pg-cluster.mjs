import { existsSync, appendFileSync, mkdirSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PG_BIN = process.env.MANAGED_ORDER_PG_BIN || "/usr/lib/postgresql/16/bin";
const INITDB = join(PG_BIN, "initdb");
const PG_CTL = join(PG_BIN, "pg_ctl");

function run(cmd, args, env = {}) {
  return spawnSync(cmd, args, { env: { ...process.env, ...env }, encoding: "utf8" });
}

export function postgresBinariesAvailable() {
  return existsSync(INITDB) && existsSync(PG_CTL);
}

export function startDisposablePostgres() {
  if (!postgresBinariesAvailable()) {
    throw new Error(`postgres binaries missing under ${PG_BIN}`);
  }
  const dir = mkdtempSync(join(tmpdir(), "managed-order-pg-"));
  const pgdata = join(dir, "pgdata");
  const socketDir = join(dir, "socket");
  mkdirSync(socketDir, { recursive: true });
  const port = 55000 + Math.floor(Math.random() * 4000);
  const logFile = join(dir, "pg.log");

  const init = run(INITDB, ["-D", pgdata, "-U", "managed_order", "--auth-local=trust", "--auth-host=trust"]);
  if (init.status !== 0) {
    throw new Error(init.stderr || init.stdout || "initdb failed");
  }
  appendFileSync(
    join(pgdata, "postgresql.conf"),
    `\nport = ${port}\nunix_socket_directories = '${socketDir}'\nlisten_addresses = ''\n`,
  );
  const start = run(PG_CTL, ["-D", pgdata, "-l", logFile, "start", "-w"]);
  if (start.status !== 0) {
    throw new Error(start.stderr || start.stdout || "pg_ctl start failed");
  }
  return {
    dir,
    logFile,
    clientConfig: {
      host: socketDir,
      port,
      user: "managed_order",
      database: "postgres",
    },
    stop() {
      run(PG_CTL, ["-D", pgdata, "stop", "-m", "fast"]);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
