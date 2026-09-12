import { existsSync, mkdirSync, mkdtempSync, rmSync, appendFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { refuse } from "./refuse.mjs";
import { FAILED_DOSSIER_PROJECTION } from "./failed-dossier.mjs";

const PG_BIN_CANDIDATES = [
  process.env.REFUND_PG_BIN,
  "/usr/lib/postgresql/16/bin",
  "/usr/lib/postgresql/17/bin",
  "/usr/lib/postgresql/15/bin",
].filter(Boolean);

export const DEFAULT_PG_BIN = PG_BIN_CANDIDATES[0] || "/usr/lib/postgresql/16/bin";

export function postgresBinaries(pgBin = resolvePgBin()) {
  if (!pgBin) {
    return { initdb: null, pgCtl: null, psql: null, available: false };
  }
  const initdb = join(pgBin, "initdb");
  const pgCtl = join(pgBin, "pg_ctl");
  const psql =
    process.env.REFUND_PSQL ||
    (existsSync("/usr/bin/psql") ? "/usr/bin/psql" : join(pgBin, "psql"));
  return { initdb, pgCtl, psql, available: existsSync(initdb) && existsSync(pgCtl) && existsSync(psql) };
}

function resolvePgBin() {
  for (const dir of PG_BIN_CANDIDATES) {
    if (existsSync(join(dir, "initdb")) && existsSync(join(dir, "pg_ctl"))) return dir;
  }
  return null;
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
  const socketDir = mkdtempSync("/tmp/cw63-pg-socket-");
  mkdirSync(socketDir, { recursive: true });
  const port = Number(process.env.REFUND_PG_PORT || 55593);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    rmSync(dir, { recursive: true, force: true });
    rmSync(socketDir, { recursive: true, force: true });
    refuse("invalid_pg_port", "REFUND_PG_PORT must be an integer from 1024 to 65535");
  }
  const logFile = join(dir, "pg.log");

  const init = run(bins.initdb, [
    "-D",
    pgdata,
    "-U",
    "projector_accept",
    "--auth-local=trust",
    "--auth-host=trust",
    "--locale=C",
    "--encoding=UTF8",
  ]);
  if (init.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    rmSync(socketDir, { recursive: true, force: true });
    throw new Error(init.stderr || init.stdout || "initdb failed");
  }

  appendFileSync(
    join(pgdata, "postgresql.conf"),
    `\nport = ${port}\nunix_socket_directories = '${socketDir}'\nlisten_addresses = ''\n`,
  );

  const start = run(bins.pgCtl, ["-D", pgdata, "-l", logFile, "start", "-w"]);
  if (start.status !== 0) {
    const log = existsSync(logFile) ? readFileSync(logFile, "utf8").slice(-4000) : "";
    // Retain failed-start diagnostics. Never remove a possibly running cluster.
    throw new Error(`${start.stderr || start.stdout || "pg_ctl start failed"}\n${log}\nRetained: ${dir}; socket: ${socketDir}`);
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
      const stopped = run(bins.pgCtl, ["-D", pgdata, "stop", "-m", "fast", "-w"], env);
      if (stopped.status !== 0) throw new Error(`owned Postgres stop failed: ${stopped.stderr}; retained ${dir}`);
      rmSync(dir, { recursive: true, force: true });
      rmSync(socketDir, { recursive: true, force: true });
    },
  };
}

export const PROJECTION_DDL = `
CREATE TABLE refund_obligation_projections (
  operation_id text PRIMARY KEY,
  amount_usdc text NOT NULL,
  buyer_class text NOT NULL,
  delivery text NOT NULL,
  outcome_kind text NOT NULL CHECK (outcome_kind IN ('analysis', 'operational_error', 'engine_failure', 'transport_failure', 'unknown')),
  refund_claim text NOT NULL CHECK (refund_claim IN ('none', 'unknown', 'not-offered')),
  refund_claim_source text NOT NULL CHECK (refund_claim_source IN ('explicit_policy', 'no_policy', 'no_matching_rule')),
  policy_id text,
  paid_out boolean NOT NULL DEFAULT false,
  CONSTRAINT never_paid_out CHECK (paid_out = false),
  CONSTRAINT never_payable_claim CHECK (refund_claim <> 'payable')
);
CREATE TABLE failed_job_policy_projections (
  evidence_id text NOT NULL,
  policy_key text NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (evidence_id, policy_key),
  CONSTRAINT failed_job_never_paid CHECK ((record->'paidOut' = 'false'::jsonb) IS TRUE),
  CONSTRAINT failed_job_nonpayable CHECK ((record->>'refundClaim' IN ('none', 'unknown', 'not-offered')) IS TRUE),
  CONSTRAINT failed_job_explicit_claim CHECK ((record->>'refundClaim' = 'unknown' OR
    (record->>'refundClaimSource' = 'explicit_policy' AND record->>'policyId' IS NOT NULL)) IS TRUE),
  CONSTRAINT failed_job_no_amount CHECK ((record->'amountUsdc' = 'null'::jsonb) IS TRUE),
  CONSTRAINT failed_job_no_settlement CHECK ((record->'paymentClassification'->>'settlementStatus' IN ('unknown', 'not-attempted')) IS TRUE)
);
`;

export function installSchema(cluster) {
  cluster.psql(PROJECTION_DDL);
}

export function insertProjection(cluster, projection) {
  if (projection.paidOut || projection.obligationsPostedAsPaid) {
    refuse("post_paid_refused", "this projector never posts obligations as paid");
  }
  if (projection.citedBankedUsdcAttached) {
    refuse(
      "cited_banked_usdc_is_not_job_revenue",
      "this projector never stores the banked settlement observation on a job row",
    );
  }
  if (projection.schema === FAILED_DOSSIER_PROJECTION) {
    const statements = projection.records.map((row) => {
      if (row.paidOut !== false || row.amountUsdc !== null) refuse("post_paid_refused", "failed-job evidence is nonsettling");
      return `INSERT INTO failed_job_policy_projections (evidence_id, policy_key, record) VALUES
        (${literal(row.evidenceId)}, ${literal(row.policyId || "no-policy")}, ${literal(JSON.stringify(row))}::jsonb);`;
    });
    cluster.psql(`BEGIN;\n${statements.join("\n")}\nCOMMIT;`);
    return;
  }
  for (const row of projection.records) {
    if (row.paidOut) {
      refuse("post_paid_refused", "this projector never posts obligations as paid");
    }
    const sql = `INSERT INTO refund_obligation_projections
      (operation_id, amount_usdc, buyer_class, delivery, outcome_kind, refund_claim, refund_claim_source, policy_id, paid_out)
      VALUES (
        ${literal(row.operationId)},
        ${literal(row.amountUsdc)},
        ${literal(row.buyerClass)},
        ${literal(row.delivery)},
        ${literal(row.outcomeKind)},
        ${literal(row.refundClaim)},
        ${literal(row.refundClaimSource)},
        ${row.policyId == null ? "NULL" : literal(row.policyId)},
        false
      );`;
    cluster.psql(sql);
  }
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
