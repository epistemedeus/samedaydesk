import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  canonicalizeMcpToolCallsObservedFrom,
  emptyDelta,
  validateDelta,
} from "../lib/pulse-store/schema.js";
import {
  createFileFallbackStore,
  createPulseStoreFromTransport,
} from "../lib/pulse-store/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = readFileSync(
  join(__dirname, "../../supabase/migrations/0002_pulse_durable.sql"),
  "utf8",
);
const AMENDMENT_SQL = readFileSync(
  join(__dirname, "../../supabase/migrations/0003_pulse_mcp_tool_demand.sql"),
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
    logFile,
    env,
    restart() {
      const stop = run(PG_CTL, ["-D", pgdata, "stop", "-m", "fast"], env);
      assert.equal(stop.status, 0, stop.stderr || stop.stdout);
      const start = run(PG_CTL, ["-D", pgdata, "-l", logFile, "start", "-w"], env);
      assert.equal(start.status, 0, start.stderr || start.stdout);
    },
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
${AMENDMENT_SQL}
`,
  });
}

function applyBaseMigration(cluster) {
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

  const freshBoundary = psql(
    cluster,
    "SELECT mcp_tool_calls_observed_from IS NOT NULL FROM public.pulse_aggregate WHERE classification_schema_version=2;",
  );
  assert.match(freshBoundary, /t/, "fresh schema must persist the dimension boundary");

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
    "mcpToolCallsObservedFrom": "2026-09-02T12:00:00.000Z",
    "mcpToolCallsByName": {"check_ai_readiness": 2},
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
    "mcpProtocolByMethod": {}, "mcpToolCallsObservedFrom": "2026-09-02T12:00:00.000Z",
    "mcpToolCallsByName": {}, "byPath": {}, "byReferer": {}, "byAiBot": {},
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
  IF v_snap->>'mcpToolCallsObservedFrom' IS DISTINCT FROM '2026-09-02T12:00:00+00:00' THEN RAISE EXCEPTION 'tool boundary wrong'; END IF;
  IF (v_snap->'mcpToolCallsByName'->>'check_ai_readiness')::int <> 2 THEN RAISE EXCEPTION 'tool count wrong'; END IF;
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
    PERFORM public.pulse_apply_delta('b0000000-0000-4000-8000-000000000002'::uuid, '{"schemaVersion": 2, "total": -1, "humans": 0, "bots": 0, "aiCrawlers": 0, "mcpSurfaceGets": 0, "mcpProtocolRequests": 0, "mcpProtocolMessages": 0, "mcpProtocolByMethod": {}, "mcpToolCallsObservedFrom":"2026-09-02T12:00:00.000Z", "mcpToolCallsByName":{}, "byPath": {}, "byReferer": {}, "byAiBot": {}, "funnel": {"home":0,"scan":0,"tools":0,"reports":0,"guides":0,"pricing":0}, "sellerRepair": {"briefViews":0,"scopeClicks":0,"checkoutStarts":0,"byFinding":{}}}');
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

test("real PostgreSQL: existing seven-call row gains only a later name boundary", { timeout: 120_000 }, (t) => {
  requirePostgresBinaries();
  const cluster = startDisposableCluster();
  t.after(() => cluster.stop());
  applyBaseMigration(cluster);
  psql(cluster, `
    INSERT INTO public.pulse_aggregate (
      classification_schema_version, observation_started_at,
      mcp_protocol_requests, mcp_protocol_messages, mcp_protocol_by_method
    ) VALUES (
      2, '2026-09-01T00:00:00Z', 7, 7, '{"tools/call":7}'::jsonb
    );
  `);
  psql(cluster, null, { input: AMENDMENT_SQL });
  const migrated = psql(cluster, `
    SELECT
      observation_started_at = '2026-09-01T00:00:00Z'::timestamptz,
      mcp_protocol_by_method->>'tools/call',
      mcp_tool_calls_by_name = '{}'::jsonb,
      mcp_tool_calls_observed_from > observation_started_at
    FROM public.pulse_aggregate WHERE classification_schema_version=2;
  `);
  assert.match(migrated, /t\s*\|\s*7\s*\|\s*t\s*\|\s*t/);
  const boundaryBefore = psql(cluster, "SELECT mcp_tool_calls_observed_from::text FROM public.pulse_aggregate WHERE classification_schema_version=2;");
  psql(cluster, null, { input: AMENDMENT_SQL });
  const boundaryAfter = psql(cluster, "SELECT mcp_tool_calls_observed_from::text FROM public.pulse_aggregate WHERE classification_schema_version=2;");
  assert.equal(boundaryAfter, boundaryBefore, "migration replay must preserve its first boundary");
});

test("S125 SQL format gate: PG echoes +00:00; wire .mmmZ required", { timeout: 120_000 }, (t) => {
  requirePostgresBinaries();
  const cluster = startDisposableCluster();
  t.after(() => cluster.stop());
  applyMigration(cluster);

  serviceRoleSql(cluster, `
DO $$
DECLARE
  v_flush uuid := 'c0000000-0000-4000-8000-000000000001';
  v_flush2 uuid := 'c0000000-0000-4000-8000-000000000002';
  v_flush3 uuid := 'c0000000-0000-4000-8000-000000000003';
  v_ok jsonb;
  v_snap jsonb;
  v_delta_ok jsonb := '{
    "schemaVersion": 2, "total": 1, "humans": 1, "bots": 0, "aiCrawlers": 0,
    "mcpSurfaceGets": 0, "mcpProtocolRequests": 0, "mcpProtocolMessages": 0,
    "mcpProtocolByMethod": {}, "mcpToolCallsObservedFrom": "2026-09-02T12:00:00.000Z",
    "mcpToolCallsByName": {"check_ai_readiness": 1}, "byPath": {}, "byReferer": {}, "byAiBot": {},
    "funnel": {"home":0,"scan":0,"tools":0,"reports":0,"guides":0,"pricing":0},
    "sellerRepair": {"briefViews":0,"scopeClicks":0,"checkoutStarts":0,"byFinding":{}}
  }'::jsonb;
  v_delta_bad jsonb := '{
    "schemaVersion": 2, "total": 1, "humans": 1, "bots": 0, "aiCrawlers": 0,
    "mcpSurfaceGets": 0, "mcpProtocolRequests": 0, "mcpProtocolMessages": 0,
    "mcpProtocolByMethod": {}, "mcpToolCallsObservedFrom": "2026-09-02T12:00:00+00:00",
    "mcpToolCallsByName": {}, "byPath": {}, "byReferer": {}, "byAiBot": {},
    "funnel": {"home":0,"scan":0,"tools":0,"reports":0,"guides":0,"pricing":0},
    "sellerRepair": {"briefViews":0,"scopeClicks":0,"checkoutStarts":0,"byFinding":{}}
  }'::jsonb;
BEGIN
  v_ok := public.pulse_apply_delta(v_flush, v_delta_ok);
  IF v_ok->>'status' <> 'applied' THEN RAISE EXCEPTION 'wire form apply failed'; END IF;

  v_snap := public.pulse_read_snapshot('2026-09-01T00:00:00Z'::timestamptz, '2026-09-03T00:00:00Z'::timestamptz);
  IF v_snap->>'mcpToolCallsObservedFrom' IS DISTINCT FROM '2026-09-02T12:00:00+00:00' THEN
    RAISE EXCEPTION 'expected PG echo +00:00, got %', v_snap->>'mcpToolCallsObservedFrom';
  END IF;

  BEGIN
    PERFORM public.pulse_apply_delta(v_flush2, v_delta_bad);
    RAISE EXCEPTION 'failure-shaped +00:00 must be rejected';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM IS DISTINCT FROM 'pulse_invalid_field:mcpToolCallsObservedFrom' THEN
      RAISE EXCEPTION 'wrong rejection: %', SQLERRM;
    END IF;
  END;

  v_ok := public.pulse_apply_delta(
    v_flush3,
    jsonb_set(v_delta_bad, '{mcpToolCallsObservedFrom}', to_jsonb('2026-09-02T12:00:00.000Z'::text))
  );
  IF v_ok->>'status' <> 'applied' THEN RAISE EXCEPTION 'canonicalized retry failed'; END IF;

  v_ok := public.pulse_apply_delta(
    v_flush3,
    jsonb_set(v_delta_bad, '{mcpToolCallsObservedFrom}', to_jsonb('2026-09-02T12:00:00.000Z'::text))
  );
  IF v_ok->>'status' <> 'already_applied' THEN RAISE EXCEPTION 'idempotency broken'; END IF;

  v_snap := public.pulse_read_snapshot('2026-09-01T00:00:00Z'::timestamptz, '2026-09-03T00:00:00Z'::timestamptz);
  IF (v_snap->>'total')::int <> 2 THEN RAISE EXCEPTION 'totals wrong after repair path: %', v_snap->>'total'; END IF;
END $$;
`);
});

function psqlTuples(cluster, sql) {
  const args = ["-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql];
  const result = run(PSQL, args, cluster.env);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "psql tuples failed");
  }
  return result.stdout.trim();
}

function createPsqlPulseTransport(cluster) {
  function serviceSelectJson(sql) {
    const input = `SET ROLE service_role;\n${sql}\nRESET ROLE;`;
    const args = ["-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"];
    const result = run(PSQL, args, cluster.env, input);
    if (result.status !== 0) {
      const err = new Error(result.stderr || result.stdout || "psql failed");
      err.stderr = result.stderr || result.stdout;
      throw err;
    }
    const lines = result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const jsonLine = lines.find((line) => line.startsWith("{") || line.startsWith("["));
    if (!jsonLine) throw new Error(`pulse_psql_transport_no_json:${result.stdout}`);
    return JSON.parse(jsonLine);
  }

  return {
    async rpc(fn, args) {
      try {
        if (fn === "pulse_apply_delta") {
          const flushId = args.p_flush_id;
          const deltaJson = JSON.stringify(args.p_delta).replace(/'/g, "''");
          const data = serviceSelectJson(
            `SELECT public.pulse_apply_delta('${flushId}'::uuid, '${deltaJson}'::jsonb);`,
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
            code: /22023|pulse_invalid_field|pulse_flush_id_conflict/.test(message)
              ? "22023"
              : "pulse_rpc_failed",
          },
        };
      }
    },
  };
}

test("S130 JS producer/store/WAL -> real PG17 -> hydrate -> next flush", { timeout: 180_000 }, async (t) => {
  requirePostgresBinaries();
  const cluster = startDisposableCluster();
  t.after(() => cluster.stop());
  applyMigration(cluster);

  const observedFrom = "2026-09-02T12:00:00.000Z";
  const fractionalFrom = "2026-09-02T12:00:00.123Z";
  const alreadyId = "d0000000-0000-4000-8000-000000000081";
  const pendingId = "d0000000-0000-4000-8000-000000000082";
  const conflictId = "d0000000-0000-4000-8000-000000000083";
  const nextId = "d0000000-0000-4000-8000-000000000084";

  // Actual schema.js helper — not a SQL string substitute.
  assert.equal(
    canonicalizeMcpToolCallsObservedFrom("2026-09-02T12:00:00+00:00"),
    "2026-09-02T12:00:00.000Z",
  );
  assert.throws(() => canonicalizeMcpToolCallsObservedFrom("2026-02-30T12:00:00.000Z"), /mcpToolCallsObservedFrom/);
  assert.throws(() => canonicalizeMcpToolCallsObservedFrom("not-a-date"), /mcpToolCallsObservedFrom/);
  // Sub-millisecond caveat: JS Date is ms-precision; finer fractions collapse to milliseconds.
  assert.equal(
    canonicalizeMcpToolCallsObservedFrom("2026-09-02T12:00:00.1234Z"),
    "2026-09-02T12:00:00.123Z",
  );

  const transport = createPsqlPulseTransport(cluster);
  const store = createPulseStoreFromTransport(transport);

  const already = {
    ...emptyDelta(observedFrom),
    total: 2,
    humans: 2,
    mcpToolCallsByName: { check_ai_readiness: 2 },
  };
  const applied = await store.flush(alreadyId, already);
  assert.equal(applied.status, "applied");

  const receiptHash = psqlTuples(
    cluster,
    `SELECT delta_hash FROM public.pulse_flush_receipts WHERE flush_id='${alreadyId}';`,
  );
  assert.match(receiptHash, /^[0-9a-f]{32}$/);
  const validatedAlready = validateDelta(already);
  const canonicalHash = psqlTuples(
    cluster,
    `SELECT public.pulse_delta_hash(public.pulse_validate_delta('${JSON.stringify(validatedAlready).replace(/'/g, "''")}'::jsonb));`,
  );
  assert.equal(receiptHash, canonicalHash, "server receipt must match canonical validated delta hash");

  // Fractional-second PG jsonb echo (via validate path; least() on aggregate keeps earliest boundary).
  const fracEcho = psqlTuples(
    cluster,
    `SELECT public.pulse_validate_delta('${JSON.stringify({
      ...validatedAlready,
      total: 0,
      humans: 0,
      mcpToolCallsByName: {},
      mcpToolCallsObservedFrom: fractionalFrom,
    }).replace(/'/g, "''")}'::jsonb)->>'mcpToolCallsObservedFrom';`,
  );
  assert.equal(
    fracEcho,
    "2026-09-02T12:00:00.123+00:00",
    "PG jsonb timestamptz echo retains millisecond fraction with +00:00 offset",
  );
  assert.equal(
    canonicalizeMcpToolCallsObservedFrom(fracEcho),
    fractionalFrom,
    "JS helper/adapter must canonicalize fractional PG echo back to wire .mmmZ",
  );

  const hydrated = await store.readSnapshot("2026-09-01T00:00:00.000Z", "2026-09-03T00:00:00.000Z");
  assert.equal(hydrated.mcpToolCallsObservedFrom, observedFrom);
  assert.equal(hydrated.total, 2);

  // Pre-fix on-disk WAL: lost-ack of already-applied canonical delta + never-applied +00:00 shape.
  const dir = mkdtempSync(join(tmpdir(), "pulse-s130-wal-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const walFile = join(dir, "fallback.json");
  const pending = {
    ...emptyDelta(observedFrom),
    total: 3,
    humans: 3,
    mcpToolCallsByName: { check_ai_readiness: 3 },
    mcpToolCallsObservedFrom: "2026-09-02T12:00:00+00:00",
  };
  const oldWal = {
    version: 2,
    pendingFlushes: [
      { flushId: alreadyId, delta: already, createdAt: observedFrom },
      { flushId: pendingId, delta: pending, createdAt: observedFrom },
    ],
    droppedUnknown: 7,
    legacyImported: true,
    observationStartedAt: observedFrom,
    mcpToolCallsObservedFrom: pending.mcpToolCallsObservedFrom,
    migratedSnapshotDigest: "b".repeat(64),
    snapshotCorrupt: false,
  };
  writeFileSync(walFile, JSON.stringify(oldWal));

  cluster.restart();

  const seen = [];
  const observedStore = createPulseStoreFromTransport({
    async rpc(fn, args) {
      if (fn === "pulse_apply_delta") seen.push(args.p_flush_id);
      return transport.rpc(fn, args);
    },
  });
  const fallback = createFileFallbackStore(walFile);
  assert.equal(fallback.isCorrupt(), false);
  assert.deepEqual(
    fallback.loadPendingFlushes().map((row) => row.flushId),
    [alreadyId, pendingId],
  );
  assert.equal(
    JSON.parse(readFileSync(walFile, "utf8")).pendingFlushes[1].delta.mcpToolCallsObservedFrom,
    "2026-09-02T12:00:00+00:00",
    "load alone must not rewrite failure-shaped WAL bytes",
  );

  const { configurePulseStoreForTests, __pulseTestInternals } = await import("../lib/pulse.js");
  configurePulseStoreForTests({ store: observedStore, fileFallback: fallback, autoHydrate: false });
  await __pulseTestInternals().drainPendingFlushes();
  assert.deepEqual(seen, [alreadyId, pendingId], "exact original flush IDs retained through drain");
  assert.equal(fallback.loadPendingFlushes().length, 0);
  assert.equal(fallback.getDroppedUnknown(), 7);
  assert.equal(
    JSON.parse(readFileSync(walFile, "utf8")).migratedSnapshotDigest,
    oldWal.migratedSnapshotDigest,
  );
  assert.equal(fallback.isCorrupt(), false);

  const afterDrain = await store.readSnapshot("2026-09-01T00:00:00.000Z", "2026-09-03T00:00:00.000Z");
  // already(2) was already_applied; pending(3) newly applied => 5
  assert.equal(afterDrain.total, 5);
  assert.equal(afterDrain.mcpToolCallsByName.check_ai_readiness, 5);
  assert.equal(afterDrain.mcpToolCallsObservedFrom, observedFrom);

  // Repeat restart/drain: zero second counter increase.
  cluster.restart();
  configurePulseStoreForTests({
    store: observedStore,
    fileFallback: createFileFallbackStore(walFile),
    autoHydrate: false,
  });
  const seenBefore = seen.length;
  await __pulseTestInternals().drainPendingFlushes();
  assert.equal(seen.length, seenBefore, "empty WAL after drain must not re-apply");
  assert.equal(
    (await store.readSnapshot("2026-09-01T00:00:00.000Z", "2026-09-03T00:00:00.000Z")).total,
    5,
  );

  // Receipt remains compatible after lost-ack replay.
  assert.equal(
    psqlTuples(cluster, `SELECT delta_hash FROM public.pulse_flush_receipts WHERE flush_id='${alreadyId}';`),
    receiptHash,
  );

  // Conflicting counters with same ID still fail.
  const seed = await store.flush(conflictId, { ...emptyDelta(observedFrom), total: 1, humans: 1 });
  assert.equal(seed.status, "applied");
  const conflict = await transport.rpc("pulse_apply_delta", {
    p_flush_id: conflictId,
    p_delta: validateDelta({ ...emptyDelta(observedFrom), total: 9, humans: 9 }),
  });
  assert.ok(conflict.error, "conflicting same-ID counters must fail");
  assert.match(conflict.error.message, /pulse_flush_id_conflict/);

  // Next producer flush after hydrate still works through real adapter + PG.
  const next = await store.flush(nextId, {
    ...emptyDelta(hydrated.mcpToolCallsObservedFrom),
    total: 4,
    humans: 4,
  });
  assert.equal(next.status, "applied");
  assert.equal(
    (await store.readSnapshot("2026-09-01T00:00:00.000Z", "2026-09-03T00:00:00.000Z")).total,
    10,
  );
});
