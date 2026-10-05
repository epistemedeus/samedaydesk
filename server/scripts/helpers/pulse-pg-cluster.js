import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PG_BIN = process.env.PULSE_PG_BIN || "/usr/lib/postgresql/17/bin";
const INITDB = join(PG_BIN, "initdb");
const PG_CTL = join(PG_BIN, "pg_ctl");

export function run(cmd, args, env = {}, input) {
  return spawnSync(cmd, args, {
    env: { ...process.env, ...env },
    input,
    encoding: "utf8",
  });
}

export function resolvePsql() {
  if (process.env.PULSE_PSQL) return process.env.PULSE_PSQL;
  const candidates = ["/usr/bin/psql", join(PG_BIN, "psql")];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  const located = run("sh", ["-c", "command -v psql"]).stdout.trim();
  return located || "psql";
}

export const PSQL = resolvePsql();

export function requirePostgresBinaries() {
  for (const bin of [INITDB, PG_CTL, PSQL]) {
    if (!existsSync(bin)) {
      console.error(`pulse_postgres_missing_binary:${bin}`);
      process.exit(2);
    }
  }
}

export function startDisposableCluster() {
  const dir = mkdtempSync(join(tmpdir(), "pulse-pg-real-"));
  const pgdata = join(dir, "pgdata");
  const socketDir = join(dir, "socket");
  mkdirSync(socketDir, { recursive: true });
  const port = 55000 + Math.floor(Math.random() * 4000);
  const logFile = join(dir, "pg.log");
  const init = run(INITDB, ["-D", pgdata, "-U", "pulse_accept", "--auth-local=trust", "--auth-host=trust"]);
  assert.equal(init.status, 0, init.stderr || init.stdout);
  appendFileSync(
    join(pgdata, "postgresql.conf"),
    `\nport = ${port}\nunix_socket_directories = '${socketDir}'\nlisten_addresses = ''\n`,
  );
  const start = run(PG_CTL, ["-D", pgdata, "-l", logFile, "start", "-w"]);
  assert.equal(start.status, 0, start.stderr || start.stdout);
  const env = { PGHOST: socketDir, PGPORT: String(port), PGUSER: "pulse_accept" };
  return {
    dir,
    pgdata,
    logFile,
    env,
    stop() {
      run(PG_CTL, ["-D", pgdata, "stop", "-m", "fast"], env);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function psql(cluster, sql, opts = {}) {
  const args = ["-d", "postgres", "-v", "ON_ERROR_STOP=1"];
  if (opts.role) args.push("-U", opts.role);
  const result = run(PSQL, sql ? [...args, "-c", sql] : args, cluster.env, opts.input);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "psql failed");
  }
  return result.stdout;
}

export function psqlTuples(cluster, sql) {
  const result = run(PSQL, ["-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql], cluster.env);
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "psql tuples failed");
  return result.stdout.trim();
}

export function serviceRoleSql(cluster, body) {
  psql(cluster, null, { input: `SET ROLE service_role;\n${body}\nRESET ROLE;` });
}

export function createPsqlPulseTransport(cluster) {
  function serviceSelectJson(sql) {
    const result = run(
      PSQL,
      ["-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
      cluster.env,
      `SET ROLE service_role;\n${sql}\nRESET ROLE;`,
    );
    if (result.status !== 0) {
      const err = new Error(result.stderr || result.stdout || "psql failed");
      err.stderr = result.stderr || result.stdout;
      throw err;
    }
    const jsonLine = result.stdout
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("{") || line.startsWith("["));
    if (!jsonLine) throw new Error(`pulse_psql_transport_no_json:${result.stdout}`);
    return JSON.parse(jsonLine);
  }

  return {
    async rpc(fn, args) {
      try {
        if (fn === "pulse_apply_delta") {
          const deltaJson = JSON.stringify(args.p_delta).replace(/'/g, "''");
          const data = serviceSelectJson(
            `SELECT public.pulse_apply_delta('${args.p_flush_id}'::uuid, '${deltaJson}'::jsonb);`,
          );
          return { data, error: null };
        }
        if (fn === "pulse_read_snapshot") {
          const start = String(args.p_observation_start).replace(/'/g, "''");
          const end = String(args.p_observation_end).replace(/'/g, "''");
          const data = serviceSelectJson(
            `SELECT public.pulse_read_snapshot('${start}'::timestamptz, '${end}'::timestamptz);`,
          );
          return { data, error: null };
        }
        return { data: null, error: { message: `unknown_rpc:${fn}` } };
      } catch (err) {
        const message = String(err?.stderr || err?.message || err);
        return {
          data: null,
          error: {
            message,
            code: /22023|pulse_invalid_field|pulse_flush_id_conflict/.test(message) ? "22023" : "pulse_rpc_failed",
          },
          status: /22023|pulse_invalid_field|pulse_flush_id_conflict/.test(message) ? 400 : 500,
        };
      }
    },
  };
}
