import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = readFileSync(
  join(__dirname, "../../supabase/migrations/0002_pulse_durable.sql"),
  "utf8",
);

const PG_BIN = process.env.PULSE_PG_BIN || "/usr/lib/postgresql/17/bin";
const INITDB = join(PG_BIN, "initdb");
const PG_CTL = join(PG_BIN, "pg_ctl");

function run(cmd, args, env = {}, input) {
  return spawnSync(cmd, args, {
    env: { ...process.env, ...env },
    input,
    encoding: "utf8",
  });
}

function resolvePsql() {
  if (process.env.PULSE_PSQL) return process.env.PULSE_PSQL;
  const candidates = ["/usr/bin/psql", join(PG_BIN, "psql")];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  const located = run("sh", ["-c", "command -v psql"]).stdout.trim();
  return located || "psql";
}

const PSQL = resolvePsql();

function requirePostgresBinaries() {
  for (const bin of [INITDB, PG_CTL, PSQL]) {
    if (!existsSync(bin)) {
      console.error(`pulse_postgres_missing_binary:${bin}`);
      process.exit(2);
    }
  }
}

function startDisposableCluster() {
  const dir = mkdtempSync(join(tmpdir(), "pulse-pg-real-"));
  const pgdata = join(dir, "pgdata");
  const socketDir = join(dir, "socket");
  mkdirSync(socketDir, { recursive: true });
  const port = 55000 + Math.floor(Math.random() * 4000);
  const logFile = join(dir, "pg.log");

  const init = run(INITDB, [
    "-D",
    pgdata,
    "-U",
    "pulse_accept",
    "--auth-local=trust",
    "--auth-host=trust",
  ]);
  assert.equal(init.status, 0, init.stderr || init.stdout);

  appendFileSync(
    join(pgdata, "postgresql.conf"),
    `\nport = ${port}\nunix_socket_directories = '${socketDir}'\nlisten_addresses = ''\n`,
  );

  const start = run(PG_CTL, ["-D", pgdata, "-l", logFile, "start", "-w"]);
  assert.equal(start.status, 0, start.stderr || start.stdout);

  const env = {
    PGHOST: socketDir,
    PGPORT: String(port),
    PGUSER: "pulse_accept",
  };

  return {
    dir,
    pgdata,
    env,
    stop() {
      run(PG_CTL, ["-D", pgdata, "stop", "-m", "fast"], env);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function psql(cluster, sql, opts = {}) {
  const args = ["-d", "postgres", "-v", "ON_ERROR_STOP=1"];
  if (opts.role) args.push("-U", opts.role);
  const result = run(PSQL, sql ? [...args, "-c", sql] : args, cluster.env, opts.input);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "psql failed");
  }
  return result.stdout;
}

function applyMigration(cluster) {
  psql(cluster, null, {
    input: `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
GRANT USAGE ON SCHEMA public TO service_role;
${MIGRATION_SQL}
`,
  });
}

function serviceRoleSql(cluster, body) {
  psql(cluster, null, {
    input: `SET ROLE service_role;\n${body}\nRESET ROLE;`,
  });
}

function expectDenied(cluster, role, sql) {
  const result = run(
    PSQL,
    ["-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `SET ROLE ${role}; ${sql}`],
    cluster.env,
  );
  assert.notEqual(result.status, 0, `expected ${role} to be denied for: ${sql}`);
}

test("real PostgreSQL: migration applies and RPC semantics hold", { timeout: 120_000 }, (t) => {
  requirePostgresBinaries();
  const cluster = startDisposableCluster();
  t.after(() => cluster.stop());

  applyMigration(cluster);

  serviceRoleSql(cluster, `
DO $$
DECLARE
  v_flush uuid := 'a0000000-0000-4000-8000-000000000001';
  v_flush2 uuid := 'a0000000-0000-4000-8000-000000000002';
  v_result jsonb;
  v_snap jsonb;
  v_finding jsonb;
  v_delta jsonb;
BEGIN
  v_delta := '{
    "schemaVersion": 2,
    "total": 10, "humans": 8, "bots": 2, "aiCrawlers": 1,
    "mcpSurfaceGets": 3, "mcpProtocolRequests": 2, "mcpProtocolMessages": 5,
    "mcpProtocolByMethod": {"initialize": 1, "tools/list": 1},
    "byPath": {"/pricing": 5}, "byReferer": {"(direct)": 10},
    "byAiBot": {"GPTBot": 1},
    "funnel": {"home": 3, "scan": 0, "tools": 0, "reports": 0, "guides": 0, "pricing": 0},
    "sellerRepair": {
      "briefViews": 2, "scopeClicks": 1, "checkoutStarts": 1,
      "byFinding": {
        "vibe-springs-btc-usd-20260830": {
          "routeClass": "paid_get",
          "briefViews": 2, "scopeClicks": 1, "checkoutStarts": 0
        }
      }
    }
  }'::jsonb;

  v_result := public.pulse_apply_delta(v_flush, v_delta);
  IF v_result->>'status' <> 'applied' THEN RAISE EXCEPTION 'apply failed'; END IF;

  v_result := public.pulse_apply_delta(v_flush, v_delta);
  IF v_result->>'status' <> 'already_applied' THEN RAISE EXCEPTION 'idempotency failed'; END IF;

  BEGIN
    PERFORM public.pulse_apply_delta(v_flush, v_delta || '{"total": 99}'::jsonb);
    RAISE EXCEPTION 'conflict should fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%pulse_flush_id_conflict%' THEN RAISE; END IF;
  END;

  PERFORM public.pulse_apply_delta(v_flush2, '{
    "schemaVersion": 2, "total": 5, "humans": 3, "bots": 2, "aiCrawlers": 0,
    "mcpSurfaceGets": 0, "mcpProtocolRequests": 0, "mcpProtocolMessages": 0,
    "mcpProtocolByMethod": {}, "byPath": {}, "byReferer": {}, "byAiBot": {},
    "funnel": {"home": 0, "scan": 0, "tools": 0, "reports": 0, "guides": 0, "pricing": 0},
    "sellerRepair": {
      "briefViews": 1, "scopeClicks": 0, "checkoutStarts": 1,
      "byFinding": {
        "vibe-springs-btc-usd-20260830": {
          "routeClass": "paid_get",
          "briefViews": 1, "scopeClicks": 0, "checkoutStarts": 1
        },
        "other-finding-abc123": {
          "routeClass": "paid_post",
          "briefViews": 0, "scopeClicks": 2, "checkoutStarts": 0
        }
      }
    }
  }'::jsonb);

  v_snap := public.pulse_read_snapshot('2026-09-01T00:00:00Z'::timestamptz, '2026-09-02T00:00:00Z'::timestamptz);
  IF (v_snap->>'total')::int <> 15 THEN RAISE EXCEPTION 'total wrong'; END IF;
  IF (v_snap->'sellerRepair'->>'briefViews')::int <> 3 THEN RAISE EXCEPTION 'briefViews wrong'; END IF;

  v_finding := v_snap->'sellerRepair'->'byFinding'->'vibe-springs-btc-usd-20260830';
  IF v_finding IS NULL THEN RAISE EXCEPTION 'first finding missing'; END IF;
  IF v_finding->>'routeClass' IS DISTINCT FROM 'paid_get' THEN RAISE EXCEPTION 'routeClass wrong'; END IF;
  IF (v_finding->>'briefViews')::int IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'finding briefViews wrong'; END IF;
  IF (v_finding->>'scopeClicks')::int IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'finding scopeClicks wrong'; END IF;
  IF (v_finding->>'checkoutStarts')::int IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'finding checkoutStarts wrong'; END IF;

  v_finding := v_snap->'sellerRepair'->'byFinding'->'other-finding-abc123';
  IF v_finding IS NULL THEN RAISE EXCEPTION 'second finding missing'; END IF;
  IF v_finding->>'routeClass' IS DISTINCT FROM 'paid_post' THEN RAISE EXCEPTION 'second routeClass wrong'; END IF;
  IF (v_finding->>'scopeClicks')::int IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'second scopeClicks wrong'; END IF;

  PERFORM public.pulse_import_legacy_observation('pr9_v1_migration', '{
    "schemaVersion": 1,
    "note": "Incomplete PR9 window only.",
    "startedAt": "2026-08-30T00:00:00.000Z",
    "total": 64, "humans": 60, "uniqueHumans": 10, "bots": 2, "aiCrawlers": 2,
    "byPath": {"/mcp": 64}, "byReferer": {"(direct)": 64},
    "byAiBot": {},
    "funnel": {"home": 0, "scan": 0, "tools": 0, "reports": 0, "guides": 0, "pricing": 0}
  }'::jsonb);
  v_result := public.pulse_import_legacy_observation('pr9_v1_migration', '{
    "schemaVersion": 1,
    "note": "Incomplete PR9 window only.",
    "startedAt": "2026-08-30T00:00:00.000Z",
    "total": 64, "humans": 60, "uniqueHumans": 10, "bots": 2, "aiCrawlers": 2,
    "byPath": {"/mcp": 64}, "byReferer": {"(direct)": 64},
    "byAiBot": {},
    "funnel": {"home": 0, "scan": 0, "tools": 0, "reports": 0, "guides": 0, "pricing": 0}
  }'::jsonb);
  IF v_result->>'status' <> 'already_imported' THEN RAISE EXCEPTION 'legacy idempotency failed'; END IF;

  BEGIN
    PERFORM public.pulse_import_legacy_observation('pr9_v1_migration', '{"schemaVersion":1,"note":"x","total":99,"humans":0,"uniqueHumans":0,"bots":0,"aiCrawlers":0,"byPath":{},"byReferer":{},"byAiBot":{},"funnel":{"home":0,"scan":0,"tools":0,"reports":0,"guides":0,"pricing":0}}'::jsonb);
    RAISE EXCEPTION 'legacy conflict should fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%pulse_legacy_import_conflict%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.pulse_apply_delta('b0000000-0000-4000-8000-000000000001'::uuid, NULL);
    RAISE EXCEPTION 'null delta accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM IS DISTINCT FROM 'pulse_invalid_delta' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.pulse_apply_delta('b0000000-0000-4000-8000-000000000002'::uuid, '{"schemaVersion": 2, "total": -1, "humans": 0, "bots": 0, "aiCrawlers": 0, "mcpSurfaceGets": 0, "mcpProtocolRequests": 0, "mcpProtocolMessages": 0, "mcpProtocolByMethod": {}, "byPath": {}, "byReferer": {}, "byAiBot": {}, "funnel": {"home":0,"scan":0,"tools":0,"reports":0,"guides":0,"pricing":0}, "sellerRepair": {"briefViews":0,"scopeClicks":0,"checkoutStarts":0,"byFinding":{}}}');
    RAISE EXCEPTION 'negative total accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM NOT LIKE 'pulse_invalid_field:total%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.pulse_apply_delta(
      'b0000000-0000-4000-8000-000000000003'::uuid,
      jsonb_set(
        v_delta,
        '{sellerRepair,byFinding}',
        '{"INVALID_KEY":{"routeClass":"paid_get","briefViews":1,"scopeClicks":0,"checkoutStarts":0}}'::jsonb,
        true
      )
    );
    RAISE EXCEPTION 'invalid finding key accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM NOT LIKE 'pulse_invalid_field:sellerRepair.byFinding%' THEN RAISE; END IF;
  END;
END $$;
`);

  psql(cluster, null, { input: MIGRATION_SQL });
  const totalAfter = psql(cluster, "SELECT total FROM public.pulse_aggregate WHERE classification_schema_version = 2;");
  assert.match(totalAfter, /15/, "migration reapplication must preserve aggregate data");

  for (const table of ["pulse_aggregate", "pulse_flush_receipts", "pulse_legacy_observations"]) {
    expectDenied(cluster, "anon", `SELECT 1 FROM public.${table} LIMIT 1;`);
    expectDenied(cluster, "authenticated", `SELECT 1 FROM public.${table} LIMIT 1;`);
  }
  for (const fn of [
    "pulse_apply_delta('00000000-0000-4000-8000-000000000099'::uuid, '{}'::jsonb)",
    "pulse_read_snapshot(now())",
    "pulse_import_legacy_observation('x', '{}'::jsonb)",
  ]) {
    expectDenied(cluster, "anon", `SELECT public.${fn};`);
    expectDenied(cluster, "authenticated", `SELECT public.${fn};`);
  }

  serviceRoleSql(cluster, `
SELECT count(*) FROM public.pulse_aggregate;
SELECT count(*) FROM public.pulse_flush_receipts;
SELECT count(*) FROM public.pulse_legacy_observations;
SELECT public.pulse_read_snapshot('2026-09-01T00:00:00Z'::timestamptz);
`);
});
