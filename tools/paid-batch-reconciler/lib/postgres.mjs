import { appendFileSync, existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS paid_batch_ledger (
  batch_id TEXT PRIMARY KEY,
  terms_version TEXT,
  status TEXT NOT NULL,
  sold BOOLEAN NOT NULL DEFAULT FALSE CHECK (sold = FALSE),
  ledger JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS paid_batch_items (
  batch_id TEXT NOT NULL REFERENCES paid_batch_ledger(batch_id),
  item_id TEXT NOT NULL,
  engine_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  funding_state TEXT NOT NULL,
  sold BOOLEAN NOT NULL DEFAULT FALSE CHECK (sold = FALSE),
  price_kind TEXT NOT NULL,
  price_usdc TEXT NOT NULL,
  PRIMARY KEY (batch_id, item_id)
);
`;

export function postgresBinDir() {
  return process.env.PAID_BATCH_PG_BIN || "/usr/lib/postgresql/16/bin";
}

export function postgresAvailable() {
  const bin = postgresBinDir();
  return existsSync(join(bin, "initdb")) && existsSync(join(bin, "pg_ctl"));
}

function run(cmd, args, env = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", env: { ...process.env, ...env } });
}

export function startDisposableCluster() {
  if (!postgresAvailable()) {
    const err = new Error("postgres binaries missing");
    err.code = "postgres-unavailable";
    throw err;
  }
  const bin = postgresBinDir();
  const dir = mkdtempSync(join(tmpdir(), "paid-batch-pg-"));
  const pgdata = join(dir, "pgdata");
  const socketDir = join(dir, "socket");
  mkdirSync(socketDir, { recursive: true });
  const port = 55434 + Math.floor(Math.random() * 200);
  const logFile = join(dir, "pg.log");
  const init = run(join(bin, "initdb"), [
    "-D",
    pgdata,
    "-U",
    "paid_batch",
    "--auth-local=trust",
    "--auth-host=trust",
  ]);
  if (init.status !== 0) throw new Error(init.stderr || init.stdout);

  appendFileSync(
    join(pgdata, "postgresql.conf"),
    `\nlisten_addresses = ''\nunix_socket_directories = '${socketDir}'\nport = ${port}\n`,
  );

  const start = run(join(bin, "pg_ctl"), [
    "-D",
    pgdata,
    "-l",
    logFile,
    "-o",
    `-p ${port} -k ${socketDir}`,
    "-w",
    "start",
  ]);
  if (start.status !== 0) throw new Error(start.stderr || start.stdout || "pg_ctl start failed");

  const createdb = run(join(bin, "createdb"), ["-h", socketDir, "-p", String(port), "-U", "paid_batch", "paid_batch"]);
  if (createdb.status !== 0) throw new Error(createdb.stderr || createdb.stdout);

  return {
    dir,
    pgdata,
    socketDir,
    port,
    user: "paid_batch",
    database: "paid_batch",
    host: socketDir,
    bin,
    connectionString: `postgresql://paid_batch@/${encodeURIComponent("paid_batch")}?host=${encodeURIComponent(socketDir)}&port=${port}`,
  };
}

export function stopDisposableCluster(cluster) {
  if (!cluster) return;
  run(join(cluster.bin, "pg_ctl"), ["-D", cluster.pgdata, "-m", "fast", "stop"]);
}

export async function withClient(cluster, fn) {
  let Pool;
  try {
    ({ Pool } = require("pg"));
  } catch {
    const err = new Error("node pg module missing; run npm install in the repository root");
    err.code = "pg-module-missing";
    throw err;
  }
  const pool = new Pool({
    host: cluster.host,
    port: cluster.port,
    user: cluster.user,
    database: cluster.database,
  });
  try {
    const client = await pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

export async function migrate(client) {
  await client.query(SCHEMA_SQL);
}

export async function persistLedger(client, ledger) {
  await client.query(
    `INSERT INTO paid_batch_ledger (batch_id, terms_version, status, sold, ledger)
     VALUES ($1, $2, $3, FALSE, $4::jsonb)
     ON CONFLICT (batch_id) DO UPDATE SET ledger = EXCLUDED.ledger, status = EXCLUDED.status`,
    [ledger.batchId, ledger.termsVersion, ledger.status, JSON.stringify(ledger)],
  );
  for (const item of ledger.items || []) {
    await client.query(
      `INSERT INTO paid_batch_items
        (batch_id, item_id, engine_id, outcome, funding_state, sold, price_kind, price_usdc)
       VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7)
       ON CONFLICT (batch_id, item_id) DO UPDATE SET
         outcome = EXCLUDED.outcome,
         funding_state = EXCLUDED.funding_state`,
      [
        ledger.batchId,
        item.id,
        item.engineId,
        item.outcome,
        item.fundingState,
        item.price?.kind || "fixture",
        item.price?.amountUsdc || "0.02",
      ],
    );
  }
}

export async function loadLedger(client, batchId) {
  const row = await client.query(`SELECT ledger FROM paid_batch_ledger WHERE batch_id = $1`, [batchId]);
  return row.rows[0]?.ledger || null;
}

