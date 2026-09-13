import { existsSync, mkdtempSync, mkdirSync, readFileSync, appendFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCHEMA_ROW } from "./pins.mjs";

const PG_BIN_CANDIDATES = [
  process.env.BUYER_VALUE_LEDGER_PG_BIN,
  "/usr/lib/postgresql/16/bin",
  "/usr/lib/postgresql/17/bin",
  "/usr/lib/postgresql/15/bin",
].filter(Boolean);

export function resolvePgBin() {
  for (const dir of PG_BIN_CANDIDATES) {
    if (existsSync(join(dir, "initdb")) && existsSync(join(dir, "pg_ctl"))) return dir;
  }
  return null;
}

export function postgresAvailable() {
  const bin = resolvePgBin();
  return Boolean(bin && existsSync(join(bin, "initdb")));
}

function run(cmd, args, env = {}, input) {
  return spawnSync(cmd, args, {
    env: { ...process.env, ...env },
    input,
    encoding: "utf8",
  });
}

export function startDisposableCluster() {
  const bin = resolvePgBin();
  if (!bin) {
    const err = new Error("postgresql initdb/pg_ctl not available");
    err.code = "postgres_unavailable";
    throw err;
  }
  const dir = mkdtempSync(join(tmpdir(), "bvl-pg-"));
  const pgdata = join(dir, "pgdata");
  const socketDir = join(dir, "socket");
  mkdirSync(socketDir, { recursive: true });
  const port = 56000 + Math.floor(Math.random() * 3000);
  const logFile = join(dir, "pg.log");
  const initdb = join(bin, "initdb");
  const pgctl = join(bin, "pg_ctl");
  const psql = existsSync(join(bin, "psql")) ? join(bin, "psql") : "psql";

  const init = run(initdb, [
    "-D",
    pgdata,
    "-U",
    "bvl_accept",
    "--auth-local=trust",
    "--auth-host=trust",
    "--locale=C",
    "--encoding=UTF8",
  ]);
  if (init.status !== 0) {
    throw new Error(init.stderr || init.stdout || "initdb failed");
  }
  appendFileSync(
    join(pgdata, "postgresql.conf"),
    `\nlisten_addresses = ''\nunix_socket_directories = '${socketDir}'\nport = ${port}\n`,
  );

  const start = run(pgctl, ["-D", pgdata, "-l", logFile, "-w", "-t", "20", "start"]);
  if (start.status !== 0) {
    throw new Error(start.stderr || start.stdout || readFileSync(logFile, "utf8"));
  }

  const env = {
    PGHOST: socketDir,
    PGPORT: String(port),
    PGUSER: "bvl_accept",
    PGDATABASE: "postgres",
  };
  const created = run(psql, ["-v", "ON_ERROR_STOP=1", "-c", "CREATE DATABASE bvl_ledger;"], env);
  if (created.status !== 0) {
    stopDisposableCluster({ pgctl, pgdata, dir });
    throw new Error(created.stderr || created.stdout || "CREATE DATABASE failed");
  }
  env.PGDATABASE = "bvl_ledger";
  const schema = run(
    psql,
    ["-v", "ON_ERROR_STOP=1", "-c", READ_SCHEMA],
    env,
  );
  if (schema.status !== 0) {
    stopDisposableCluster({ pgctl, pgdata, dir });
    throw new Error(schema.stderr || schema.stdout || "schema failed");
  }

  return {
    dir,
    pgdata,
    socketDir,
    port,
    pgctl,
    psql,
    env,
    stop: () => stopDisposableCluster({ pgctl, pgdata, dir }),
  };
}

const READ_SCHEMA = `
CREATE TABLE buyer_value_ledger_rows (
  run_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  buyer_class TEXT NOT NULL,
  sample BOOLEAN NOT NULL,
  independent_demand BOOLEAN NOT NULL DEFAULT FALSE,
  duration_ms INTEGER NOT NULL,
  output_bytes BIGINT NOT NULL,
  row_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export function stopDisposableCluster({ pgctl, pgdata, dir }) {
  run(pgctl, ["-D", pgdata, "-m", "immediate", "stop"]);
  rmSync(dir, { recursive: true, force: true });
}

export function insertRow(cluster, row) {
  if (!row || row.schema !== SCHEMA_ROW) {
    throw new Error("postgres insert requires a ledger row");
  }
  const stored = {
    ...row,
    evidence: { ...(row.evidence || {}), postgres: "local-runtime" },
  };
  const json = JSON.stringify(stored);
  const tag = "bvljson";
  if (json.includes(`$${tag}$`)) {
    throw new Error("row JSON collides with postgres dollar-quote tag");
  }
  const sql = `
INSERT INTO buyer_value_ledger_rows
  (run_id, job_id, buyer_class, sample, independent_demand, duration_ms, output_bytes, row_json)
VALUES (
  '${esc(row.runId)}',
  '${esc(row.jobId)}',
  '${esc(row.buyerClass)}',
  ${row.sample ? "TRUE" : "FALSE"},
  FALSE,
  ${Number.parseInt(String(row.durationMs), 10)},
  ${Number.parseInt(String(row.outputBytes), 10)},
  $${tag}$${json}$${tag}$::jsonb
);
`;
  const result = run(cluster.psql, ["-v", "ON_ERROR_STOP=1", "-c", sql], cluster.env);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "insert failed");
  }
  return { ok: true, store: "postgres", runId: row.runId };
}

export function selectRows(cluster) {
  const result = run(
    cluster.psql,
    ["-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", "SELECT row_json::text FROM buyer_value_ledger_rows ORDER BY created_at, run_id;"],
    cluster.env,
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "select failed");
  }
  return String(result.stdout)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function esc(value) {
  return String(value).replaceAll("'", "''");
}

