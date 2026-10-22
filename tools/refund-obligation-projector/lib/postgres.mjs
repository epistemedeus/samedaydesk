import { existsSync, mkdirSync, mkdtempSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { refuse } from "./refuse.mjs";

export const DEFAULT_PG_BIN = process.env.REFUND_PG_BIN || "/usr/lib/postgresql/16/bin";

export function postgresBinaries(pgBin = DEFAULT_PG_BIN) {
  const initdb = join(pgBin, "initdb");
  const pgCtl = join(pgBin, "pg_ctl");
  const psql =
    process.env.REFUND_PSQL ||
    (existsSync("/usr/bin/psql") ? "/usr/bin/psql" : join(pgBin, "psql"));
  return { initdb, pgCtl, psql, available: existsSync(initdb) && existsSync(pgCtl) && existsSync(psql) };
}

function run(cmd, args, env = {}, input) {
  return spawnSync(cmd, args, {
    env: { ...process.env, ...env },
    input,
    encoding: "utf8",
  });
}

export function startDisposableCluster() {
  const bins = postgresBinaries();
  if (!bins.available) {
    refuse("postgres_unavailable", "real local Postgres binaries were not found");
  }

  const dir = mkdtempSync(join(tmpdir(), "refund-obligation-pg-"));
  const pgdata = join(dir, "pgdata");
  const socketDir = join(dir, "socket");
  mkdirSync(socketDir, { recursive: true });
  const port = 55100 + Math.floor(Math.random() * 4000);
  const logFile = join(dir, "pg.log");

  const init = run(bins.initdb, [
    "-D",
    pgdata,
    "-U",
    "projector_accept",
    "--auth-local=trust",
    "--auth-host=trust",
  ]);
  if (init.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(init.stderr || init.stdout || "initdb failed");
  }

  appendFileSync(
    join(pgdata, "postgresql.conf"),
    `\nport = ${port}\nunix_socket_directories = '${socketDir}'\nlisten_addresses = ''\n`,
  );

  const start = run(bins.pgCtl, ["-D", pgdata, "-l", logFile, "start", "-w"]);
  if (start.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(start.stderr || start.stdout || "pg_ctl start failed");
  }

  const env = {
    PGHOST: socketDir,
    PGPORT: String(port),
    PGUSER: "projector_accept",
  };

  return {
    dir,
    env,
    bins,
    evidenceKind: "local_runtime",
    psql(sql) {
      const result = run(bins.psql, ["-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql], env);
      if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || "psql failed");
      }
      return result.stdout;
    },
    stop() {
      run(bins.pgCtl, ["-D", pgdata, "stop", "-m", "fast"], env);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const PROJECTION_DDL = `
CREATE TABLE refund_obligation_projections (
  operation_id text PRIMARY KEY,
  amount_usdc text NOT NULL,
  buyer_class text NOT NULL,
  delivery text NOT NULL,
  refund_claim text NOT NULL CHECK (refund_claim IN ('none', 'unknown', 'not-offered')),
  paid_out boolean NOT NULL DEFAULT false,
  CONSTRAINT never_paid_out CHECK (paid_out = false),
  CONSTRAINT never_payable_claim CHECK (refund_claim <> 'payable')
);
`;

export function installSchema(cluster) {
  cluster.psql(PROJECTION_DDL);
}

export function insertProjection(cluster, projection) {
  if (projection.paidOut || projection.obligationsPostedAsPaid) {
    refuse("post_paid_refused", "this projector never posts obligations as paid");
  }
  for (const row of projection.records) {
    if (row.paidOut) {
      refuse("post_paid_refused", "this projector never posts obligations as paid");
    }
    const sql = `INSERT INTO refund_obligation_projections
      (operation_id, amount_usdc, buyer_class, delivery, refund_claim, paid_out)
      VALUES (
        ${literal(row.operationId)},
        ${literal(row.amountUsdc)},
        ${literal(row.buyerClass)},
        ${literal(row.delivery)},
        ${literal(row.refundClaim)},
        false
      );`;
    cluster.psql(sql);
  }
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
