import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { MCP_TOOL_NAMES } from "../lib/mcp-tool-inventory.js";
import {
  PULSE_TOOL_CONTRACT_MIGRATION,
  renderPulseToolContractMigration,
} from "../lib/pulse-store/tool-contract-sql.js";
import {
  PSQL,
  psql,
  psqlTuples,
  requirePostgresBinaries,
  run,
  serviceRoleSql,
  startDisposableCluster,
} from "./helpers/pulse-pg-cluster.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const migration0002 = readFileSync(join(root, "supabase/migrations/0002_pulse_durable.sql"), "utf8");
const migration0003 = readFileSync(join(root, "supabase/migrations/0003_pulse_mcp_tool_demand.sql"), "utf8");
const HISTORICAL_0005 = "supabase/migrations/0005_pulse_admit_declared_mcp_tools.sql";
const HISTORICAL_0005_BLOB = "fa86042bb05e275f616a690f5af19c22688c68e2";
const ADMITTED_TOOL = "project_funnel_evidence";
const migration0005 = readFileSync(join(root, HISTORICAL_0005), "utf8");
const migration0006 = readFileSync(join(root, PULSE_TOOL_CONTRACT_MIGRATION), "utf8");

function gitBlobSha(text) {
  const body = Buffer.from(text);
  return createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
}

function listedToolNames(sql) {
  const listed = sql.match(/v_tool_keys text\[\] := array\[([^\]]+)\]/);
  assert.ok(listed, "tool key array missing");
  return [...listed[1].matchAll(/'([a-z0-9_]+)'/g)].map((match) => match[1]);
}

function aggregateState(cluster) {
  return psqlTuples(
    cluster,
    `SELECT mcp_tool_calls_observed_from::text
      || '|' || total::text
      || '|' || mcp_tool_calls_by_name::text
      || '|' || (
        SELECT string_agg(flush_id::text || ':' || delta_hash, ',' ORDER BY flush_id)
        FROM public.pulse_flush_receipts
      )
     FROM public.pulse_aggregate
     WHERE classification_schema_version=2;`,
  );
}

const OBSERVED = "2026-09-02T12:00:00.000Z";

function baseDelta(toolCounts, extra = {}) {
  return {
    schemaVersion: 2,
    total: 1,
    humans: 1,
    bots: 0,
    aiCrawlers: 0,
    mcpSurfaceGets: 0,
    mcpProtocolRequests: 0,
    mcpProtocolMessages: 0,
    mcpProtocolByMethod: {},
    mcpToolCallsObservedFrom: OBSERVED,
    mcpToolCallsByName: toolCounts,
    byPath: {},
    byReferer: {},
    byAiBot: {},
    funnel: { home: 0, scan: 0, tools: 0, reports: 0, guides: 0, pricing: 0 },
    sellerRepair: { briefViews: 0, scopeClicks: 0, checkoutStarts: 0, byFinding: {} },
    ...extra,
  };
}

function sqlJson(value) {
  return JSON.stringify(value).replace(/'/g, "''");
}

function applyFiles(cluster, ...sqlFiles) {
  psql(cluster, null, {
    input: `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
GRANT USAGE ON SCHEMA public TO service_role;
${sqlFiles.join("\n")}
`,
  });
}

function expectRejection(cluster, flushId, delta, messageSql) {
  const json = typeof delta === "string" ? delta.replace(/'/g, "''") : sqlJson(delta);
  serviceRoleSql(
    cluster,
    `
DO $$
BEGIN
  PERFORM public.pulse_apply_delta('${flushId}'::uuid, '${json}'::jsonb);
  RAISE EXCEPTION 'seeded rejection was accepted';
EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM NOT LIKE ${messageSql} THEN
    RAISE EXCEPTION 'wrong rejection: %', SQLERRM;
  END IF;
END $$;
`,
  );
}

function expectDenied(cluster, role, sql) {
  const result = run(
    PSQL,
    ["-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `SET ROLE ${role}; ${sql}`],
    cluster.env,
  );
  assert.notEqual(result.status, 0, `expected ${role} denial for ${sql}`);
}

test("forward migration matches the declared inventory and preserves historical 0005 bytes", () => {
  const rendered = renderPulseToolContractMigration();
  const historicalNames = listedToolNames(migration0005);
  assert.equal(PULSE_TOOL_CONTRACT_MIGRATION, "supabase/migrations/0006_pulse_admit_declared_mcp_tools.sql");
  assert.equal(gitBlobSha(migration0005), HISTORICAL_0005_BLOB);
  assert.notEqual(migration0005, rendered);
  assert.equal(migration0005.includes(ADMITTED_TOOL), false);
  assert.deepEqual([...MCP_TOOL_NAMES], [...historicalNames, ADMITTED_TOOL]);
  assert.match(migration0005, /v_tool_keys,6,32/);
  assert.equal(migration0006, rendered, "regenerate 0006 from MCP_TOOL_NAMES");
  assert.equal(rendered.includes("check_agent_readiness"), true);
  assert.equal(rendered.includes(ADMITTED_TOOL), true);
  assert.equal(/update\s+public\.pulse_aggregate/i.test(rendered), false);
  assert.equal(/delete\s+from/i.test(rendered), false);
  assert.equal(/drop\s+table/i.test(rendered), false);
  assert.deepEqual(listedToolNames(rendered), [...MCP_TOOL_NAMES]);
  assert.match(rendered, new RegExp(`v_tool_keys,${MCP_TOOL_NAMES.length},`));
});

test("real PostgreSQL 17 upgrades historical 0005 and admits project_funnel_evidence", { timeout: 180_000 }, (t) => {
  requirePostgresBinaries();
  const cluster = startDisposableCluster();
  t.after(() => cluster.stop());
  applyFiles(cluster, migration0002, migration0003);

  const boundaryBefore = psqlTuples(
    cluster,
    "SELECT mcp_tool_calls_observed_from::text FROM public.pulse_aggregate WHERE classification_schema_version=2;",
  );
  assert.notEqual(boundaryBefore, "");

  const priorId = "e1000000-0000-4000-8000-000000000001";
  serviceRoleSql(
    cluster,
    `SELECT public.pulse_apply_delta('${priorId}'::uuid, '${sqlJson(baseDelta({ check_ai_readiness: 2 }, { total: 3, humans: 3 }))}'::jsonb);`,
  );
  const receiptBefore = psqlTuples(
    cluster,
    `SELECT delta_hash FROM public.pulse_flush_receipts WHERE flush_id='${priorId}';`,
  );
  const totalBefore = psqlTuples(
    cluster,
    "SELECT total FROM public.pulse_aggregate WHERE classification_schema_version=2;",
  );
  assert.equal(totalBefore, "3");
  const boundaryAfterPrior = psqlTuples(
    cluster,
    "SELECT mcp_tool_calls_observed_from::text FROM public.pulse_aggregate WHERE classification_schema_version=2;",
  );

  expectRejection(
    cluster,
    "e1000000-0000-4000-8000-0000000000aa",
    baseDelta({ check_agent_readiness: 1 }),
    "'pulse_invalid_field:mcpToolCallsByName%'",
  );
  assert.equal(
    psqlTuples(cluster, "SELECT count(*) FROM public.pulse_flush_receipts;"),
    "1",
    "seeded sixth-tool rejection must not write a receipt",
  );

  psql(cluster, null, { input: migration0005 });
  assert.equal(
    psqlTuples(
      cluster,
      "SELECT mcp_tool_calls_observed_from::text FROM public.pulse_aggregate WHERE classification_schema_version=2;",
    ),
    boundaryAfterPrior,
    "0005 must keep the first-observed boundary",
  );
  assert.equal(
    psqlTuples(cluster, `SELECT delta_hash FROM public.pulse_flush_receipts WHERE flush_id='${priorId}';`),
    receiptBefore,
  );
  assert.equal(
    psqlTuples(cluster, "SELECT total FROM public.pulse_aggregate WHERE classification_schema_version=2;"),
    "3",
  );

  psql(cluster, null, { input: migration0005 });
  assert.equal(
    psqlTuples(
      cluster,
      "SELECT mcp_tool_calls_observed_from::text FROM public.pulse_aggregate WHERE classification_schema_version=2;",
    ),
    boundaryAfterPrior,
    "replaying 0005 must not move the boundary",
  );
  assert.equal(
    psqlTuples(cluster, `SELECT delta_hash FROM public.pulse_flush_receipts WHERE flush_id='${priorId}';`),
    receiptBefore,
  );

  const historicalNames = listedToolNames(migration0005);
  const sixCounts = Object.fromEntries(historicalNames.map((name) => [name, 1]));
  const sixId = "e1500000-0000-4000-8000-000000000006";
  serviceRoleSql(
    cluster,
    `SELECT public.pulse_apply_delta('${sixId}'::uuid, '${sqlJson(baseDelta(sixCounts, { total: historicalNames.length, humans: historicalNames.length }))}'::jsonb);`,
  );
  const stateAfterSix = aggregateState(cluster);
  assert.equal(
    psqlTuples(cluster, "SELECT count(*) FROM public.pulse_flush_receipts;"),
    "2",
  );
  assert.equal(
    psqlTuples(cluster, "SELECT position('project_funnel_evidence' in pg_get_functiondef('public.pulse_validate_delta(jsonb)'::regprocedure));"),
    "0",
    "historical 0005 must not name the seventh tool",
  );
  expectRejection(
    cluster,
    "e1600000-0000-4000-8000-000000000007",
    baseDelta({ [ADMITTED_TOOL]: 1 }),
    "'pulse_invalid_field:mcpToolCallsByName%'",
  );
  assert.equal(aggregateState(cluster), stateAfterSix, "seventh-tool refusal must not write a receipt or change state");
  assert.equal(psqlTuples(cluster, "SELECT count(*) FROM public.pulse_flush_receipts;"), "2");

  psql(cluster, null, { input: migration0006 });
  assert.equal(aggregateState(cluster), stateAfterSix, "0006 must keep six-tool receipts, counts, and the first-observed boundary");
  assert.notEqual(
    psqlTuples(cluster, "SELECT position('project_funnel_evidence' in pg_get_functiondef('public.pulse_validate_delta(jsonb)'::regprocedure));"),
    "0",
  );
  psql(cluster, null, { input: migration0006 });
  assert.equal(aggregateState(cluster), stateAfterSix, "replaying 0006 must be idempotent");

  const funnelId = "e1700000-0000-4000-8000-000000000007";
  serviceRoleSql(
    cluster,
    `SELECT public.pulse_apply_delta('${funnelId}'::uuid, '${sqlJson(baseDelta({ [ADMITTED_TOOL]: 1 }))}'::jsonb);`,
  );
  assert.equal(
    psqlTuples(
      cluster,
      `SELECT total::text || '|' || (mcp_tool_calls_by_name->>'check_ai_readiness') || '|' || (mcp_tool_calls_by_name->>'check_agent_readiness') || '|' || (mcp_tool_calls_by_name->>'${ADMITTED_TOOL}') FROM public.pulse_aggregate WHERE classification_schema_version=2;`,
    ),
    "10|3|1|1",
    "0006 admits project_funnel_evidence without rewriting the six-tool counts",
  );

  MCP_TOOL_NAMES.forEach((name, index) => {
    const flushId = `e2000000-0000-4000-8000-00000000000${index + 1}`;
    serviceRoleSql(
      cluster,
      `SELECT public.pulse_apply_delta('${flushId}'::uuid, '${sqlJson(baseDelta({ [name]: 1 }))}'::jsonb);`,
    );
  });
  const allTools = Object.fromEntries(MCP_TOOL_NAMES.map((name) => [name, 1]));
  const allId = "e3000000-0000-4000-8000-000000000010";
  const allDelta = baseDelta(allTools, { total: MCP_TOOL_NAMES.length, humans: MCP_TOOL_NAMES.length });
  serviceRoleSql(
    cluster,
    `
DO $$
DECLARE v jsonb;
BEGIN
  v := public.pulse_apply_delta('${allId}'::uuid, '${sqlJson(allDelta)}'::jsonb);
  IF v->>'status' IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'status %', v->>'status'; END IF;
  v := public.pulse_apply_delta('${allId}'::uuid, '${sqlJson(allDelta)}'::jsonb);
  IF v->>'status' IS DISTINCT FROM 'already_applied' THEN RAISE EXCEPTION 'replay status %', v->>'status'; END IF;
END $$;
`,
  );

  expectRejection(
    cluster,
    allId,
    baseDelta(allTools, { total: 9, humans: 9 }),
    "'pulse_flush_id_conflict%'",
  );
  expectRejection(
    cluster,
    "e4000000-0000-4000-8000-000000000001",
    baseDelta({ not_a_declared_tool: 1 }),
    "'pulse_invalid_field:mcpToolCallsByName%'",
  );
  expectRejection(
    cluster,
    "e4000000-0000-4000-8000-000000000002",
    baseDelta({ check_ai_readiness: -1 }),
    "'pulse_invalid_field:mcpToolCallsByName%'",
  );
  expectRejection(
    cluster,
    "e4000000-0000-4000-8000-000000000003",
    sqlJson(baseDelta({ check_ai_readiness: 1 })).replace(
      '"check_ai_readiness":1',
      '"check_ai_readiness":9223372036854775808',
    ),
    "'pulse_invalid_field:mcpToolCallsByName%'",
  );
  expectRejection(
    cluster,
    "e4000000-0000-4000-8000-000000000004",
    baseDelta([]),
    "'pulse_invalid_field:mcpToolCallsByName%'",
  );

  const counts = psqlTuples(
    cluster,
    `SELECT total::text || '|' || (mcp_tool_calls_by_name->>'check_ai_readiness') || '|' || (mcp_tool_calls_by_name->>'check_agent_readiness') || '|' || (mcp_tool_calls_by_name->>'${ADMITTED_TOOL}') FROM public.pulse_aggregate WHERE classification_schema_version=2;`,
  );
  // prior 3 + six-tool delta 6 + seventh tool 1 + one per declared tool + one all-tools delta.
  // check_ai_readiness: 2 + 1 + 1 + 1. check_agent_readiness: 1 + 1 + 1. project_funnel_evidence: 1 + 1 + 1.
  const toolCount = MCP_TOOL_NAMES.length;
  assert.equal(counts, `${3 + historicalNames.length + 1 + toolCount + toolCount}|5|3|3`);
  assert.equal(
    psqlTuples(cluster, "SELECT count(*) FROM public.pulse_flush_receipts;"),
    String(1 + 1 + 1 + toolCount + 1),
  );

  const privileges = psqlTuples(
    cluster,
    `SELECT has_function_privilege('anon', 'public.pulse_apply_delta(uuid,jsonb)', 'EXECUTE')::text
      || '|' || has_function_privilege('authenticated', 'public.pulse_read_snapshot(timestamptz,timestamptz)', 'EXECUTE')::text
      || '|' || has_function_privilege('service_role', 'public.pulse_apply_delta(uuid,jsonb)', 'EXECUTE')::text
      || '|' || has_function_privilege('anon', 'public.pulse_validate_delta(jsonb)', 'EXECUTE')::text
      || '|' || has_function_privilege('service_role', 'public.pulse_read_snapshot(timestamptz,timestamptz)', 'EXECUTE')::text;`,
  );
  assert.equal(privileges, "false|false|true|false|true");

  for (const role of ["anon", "authenticated"]) {
    expectDenied(cluster, role, "SELECT 1 FROM public.pulse_aggregate LIMIT 1;");
    expectDenied(cluster, role, "SELECT public.pulse_apply_delta('00000000-0000-4000-8000-000000000099'::uuid, '{}'::jsonb);");
    expectDenied(cluster, role, "SELECT public.pulse_read_snapshot(now());");
  }
});
