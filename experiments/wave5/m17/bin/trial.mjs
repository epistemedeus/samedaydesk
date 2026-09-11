#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  apiCatalog,
  co12Catalog,
  declaredHistoryPaths,
  historyHomepageRecord,
  mapApiRowsToCo12,
  permuteRecords,
  spaCatalog,
} from "../lib/catalogs.mjs";
import { PINS, QUERY_PROBE, SCHEMA_TRIAL, SDS52_SHA } from "../lib/pins.mjs";
import { ensureEngine } from "../lib/resolve-engine.mjs";
import { runEnginePackageTests, runRouteDiffCli } from "../lib/run-engine.mjs";
import {
  closeServer,
  observeApi,
  startLoopbackCatalogs,
  startSdsApi,
  startSpaShellApp,
} from "../lib/http.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  strict: true,
  options: {
    help: { type: "boolean", default: false },
    "out-dir": { type: "string" },
    before: { type: "string" },
    after: { type: "string" },
  },
});

const command = positionals[0] || "run";

if (values.help) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}

try {
  if (command === "engine") await cmdEngine();
  else if (command === "diff") await cmdDiff();
  else if (command === "run") await cmdRun();
  else {
    fail("invalid_args", `unknown command ${command}`);
  }
} catch (err) {
  fail(err.code || "error", err instanceof Error ? err.message : String(err));
}

function usage() {
  return `W5-M17 API-route change trial (owner-labelled dry run).

  node experiments/wave5/m17/bin/trial.mjs engine
  node experiments/wave5/m17/bin/trial.mjs diff --before <json> --after <json> --out-dir <dir>
  node experiments/wave5/m17/bin/trial.mjs run --out-dir <dir>

Consumes the pinned Co12 CLI. Does not vendor tools/route-table-diff.
No spend, deploy, or customer messages.`;
}

function fail(code, error, extra = {}) {
  process.stdout.write(`${JSON.stringify({ ok: false, refused: true, code, error, ...extra })}\n`);
  process.exit(2);
}

async function cmdEngine() {
  const engine = ensureEngine();
  process.stdout.write(`${JSON.stringify({ ok: true, engine }, null, 2)}\n`);
}

async function cmdDiff() {
  const outDir = requireOutDir();
  const result = runRouteDiffCli({
    before: values.before,
    after: values.after,
    outDir,
  });
  process.stdout.write(`${JSON.stringify({
    ok: result.classification.kind !== "engine_failure" && result.classification.kind !== "incomplete",
    classification: result.classification,
    status: result.status,
    json: result.json,
    engine: result.engine,
  }, null, 2)}\n`);
  if (result.classification.kind === "incomplete") process.exit(2);
  if (result.classification.kind === "engine_failure") process.exit(1);
  process.exit(result.status === 0 ? 0 : 2);
}

async function cmdRun() {
  const outDir = requireOutDir();
  mkdirSync(outDir, { recursive: true });

  let engine;
  try {
    engine = ensureEngine();
  } catch (err) {
    fail("m04-engine-missing", err instanceof Error ? err.message : String(err));
  }

  const spa = spaCatalog();
  const spaPermuted = spaCatalog(undefined, { note: "same SDS52 SPA_ROUTE_SHELLS, reversed order" });
  spaPermuted.routes = permuteRecords(spa.routes, "reverse");
  writeJson(outDir, "spa-catalog.json", spa);
  writeJson(outDir, "spa-catalog-permuted.json", spaPermuted);

  const perm = runRouteDiffCli({
    before: resolve(outDir, "spa-catalog.json"),
    after: resolve(outDir, "spa-catalog-permuted.json"),
    outDir: resolve(outDir, "diff-permutation"),
  });

  const homepageDoc = co12Catalog([historyHomepageRecord(), spa.routes[0]], { claim: "history table including homepage" });
  writeJson(outDir, "history-with-homepage.json", homepageDoc);
  const homepage = runRouteDiffCli({
    before: resolve(outDir, "spa-catalog.json"),
    after: resolve(outDir, "history-with-homepage.json"),
    outDir: resolve(outDir, "diff-homepage"),
  });

  const queryDoc = co12Catalog([
    { path: `/mcp?cs=${QUERY_PROBE}`, title: "MCP query | SameDayDesk", canonical: "https://samedaydesk.com/mcp" },
  ]);
  writeJson(outDir, "mcp-query-path.json", queryDoc);
  const query = runRouteDiffCli({
    before: resolve(outDir, "spa-catalog.json"),
    after: resolve(outDir, "mcp-query-path.json"),
    outDir: resolve(outDir, "diff-query"),
  });

  const api = await startSdsApi();
  let observed;
  try {
    observed = await observeApi(api.origin);
  } finally {
    await closeServer(api.server);
  }
  const mcpRows = [
    { method: "GET", path: "/mcp" },
    { method: "POST", path: "/mcp" },
  ];
  const honestApi = apiCatalog(mcpRows, { observed });
  writeJson(outDir, "api-mcp-honest.json", honestApi);
  const mapped = co12Catalog(mapApiRowsToCo12(mcpRows), { note: "path-only mapping of GET+POST /mcp" });
  writeJson(outDir, "api-mcp-co12.json", mapped);
  const duplicate = runRouteDiffCli({
    before: resolve(outDir, "spa-catalog.json"),
    after: resolve(outDir, "api-mcp-co12.json"),
    outDir: resolve(outDir, "diff-mcp-duplicate"),
  });

  const spaApp = await startSpaShellApp();
  let x402Spa;
  let x402Api;
  try {
    x402Spa = await fetch(`${spaApp.origin}/x402`, { redirect: "manual" });
    const apiAgain = await startSdsApi();
    try {
      x402Api = await fetch(`${apiAgain.origin}/x402`, { redirect: "manual" });
    } finally {
      await closeServer(apiAgain.server);
    }
  } finally {
    await closeServer(spaApp.server);
  }

  const loop = await startLoopbackCatalogs(spa, spaPermuted);
  let loopback;
  try {
    loopback = runRouteDiffCli({
      before: loop.beforeUrl,
      after: loop.afterUrl,
      outDir: resolve(outDir, "diff-loopback"),
    });
  } finally {
    loop.stop();
  }

  const engineTests = runEnginePackageTests(engine);
  const engineTestSummary = summarizeTap(engineTests.stdout);

  const result = {
    schema: SCHEMA_TRIAL,
    ok: true,
    assignment: "W5-M17",
    label: "owner-qa-dry-run",
    sold: false,
    settled: false,
    paid: false,
    postgres: "not-an-input",
    tested: {
      sds52: SDS52_SHA,
      m04: { sha: engine.sha, via: engine.via, cli: engine.cli },
      m08: PINS.m08,
      d24: PINS.d24,
    },
    spaPaths: spa.routes.map((row) => row.path),
    reactHistoryIncludesHomepage: declaredHistoryPaths().includes("/"),
    permutation: {
      classification: perm.classification,
      counts: perm.json?.counts || null,
      tableDigest: perm.json?.tableDigest || null,
    },
    homepageHistory: {
      classification: homepage.classification,
      code: homepage.json?.code || homepage.classification.code,
    },
    mcpQueryPath: {
      classification: query.classification,
      code: query.json?.code || query.classification.code,
    },
    mcpDuplicatePath: {
      classification: duplicate.classification,
      code: duplicate.json?.code || duplicate.classification.code,
    },
    loopbackPermutation: {
      classification: loopback.classification,
      evidenceClass: loopback.json?.evidenceClass || null,
    },
    http: {
      observed,
      x402OnSpaShells: { status: x402Spa.status, type: x402Spa.headers.get("content-type") || "" },
      x402OnApiProcess: { status: x402Api.status },
    },
    enginePackageTests: {
      status: engineTests.status,
      ...engineTestSummary,
    },
    remaining: [
      "W5-M04 may amend tools/route-table-diff; this trial is bound to 7387eb677abd442dfab9081cb0ad95451fd2a762.",
      "W5-M08 is unbound: no Next/FastAPI/source parsers. SDS Express HTTP observation only.",
      "W5-D24 is unbound: no clean-env package install. Re-run this kit from a fresh Node checkout of SDS plus the M04 pin.",
      "Field execution (F) still requires an allowed third-party project and a working offer. This dry run uses SameDayDesk SDS52, which is the allowed in-repo project.",
    ],
  };

  writeJson(outDir, "trial-result.json", result);
  process.stdout.write(`${JSON.stringify({ ok: true, outDir, classification: perm.classification, engine: { sha: engine.sha, via: engine.via } }, null, 2)}\n`);
}

function requireOutDir() {
  if (!values["out-dir"]) fail("missing_out_dir", "--out-dir is required");
  const dir = isAbsolute(values["out-dir"]) ? values["out-dir"] : resolve(process.cwd(), values["out-dir"]);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJson(dir, name, value) {
  writeFileSync(resolve(dir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function summarizeTap(stdout) {
  const pass = [...String(stdout || "").matchAll(/^# pass (\d+)/gm)].pop();
  const fail = [...String(stdout || "").matchAll(/^# fail (\d+)/gm)].pop();
  const tests = [...String(stdout || "").matchAll(/^# tests (\d+)/gm)].pop();
  return {
    tests: tests ? Number(tests[1]) : null,
    pass: pass ? Number(pass[1]) : null,
    fail: fail ? Number(fail[1]) : null,
  };
}
