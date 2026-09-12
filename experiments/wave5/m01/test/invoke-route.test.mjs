import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { getEngine, loadCatalog } from "../lib/catalog.mjs";
import { engineBin, ensureEngineRoot } from "../lib/engine-root.mjs";
import { invokeEngine } from "../lib/invoke.mjs";
import { MODULE_ROOT } from "../lib/paths.mjs";
import { invoke, pinFixture, tmpOut } from "./helpers.mjs";

test("route journey writes route-diff.json with added and canonical change", () => {
  const outDir = tmpOut("route-pos");
  const result = invoke("route-table-diff", {
    before: pinFixture("route-table-diff", "journey/before.json"),
    after: pinFixture("route-table-diff", "journey/after.json"),
  }, { outDir });
  assert.equal(result.outcome.kind, "analysis");
  assert.equal(result.schemaMatch.ok, true);
  assert.equal(result.stdoutJson.schema, "samedaydesk.route-diff.v1");
  assert.equal(Object.hasOwn(result.stdoutJson, "removed"), true);
  assert.equal(result.stdoutJson.outcome, "changed");
  const brief = JSON.parse(readFileSync(join(outDir, "route-diff.json"), "utf8"));
  assert.equal(brief.counts.added, 1);
  assert.equal(brief.counts.changed, 2);
  assert.equal(brief.added[0].path, "/for-agents/useful-jobs/v2");
  assert.equal(brief.removed.length, 0);
});

test("route permutation is non-breaking with equal digest.v2", () => {
  const beforePath = pinFixture("route-table-diff", "journey/before.json");
  const before = JSON.parse(readFileSync(beforePath, "utf8"));
  const outDir = tmpOut("route-perm");
  const permPath = join(outDir, "permuted.json");
  writeFileSync(
    permPath,
    `${JSON.stringify({ ...before, routes: [...before.routes].reverse() }, null, 2)}\n`,
  );
  const result = invoke("route-table-diff", { before: beforePath, after: permPath }, { outDir: join(outDir, "out") });
  assert.equal(result.outcome.kind, "analysis");
  const brief = JSON.parse(readFileSync(join(result.schemaMatch.outputs[0].path), "utf8"));
  assert.deepEqual(brief.counts, { added: 0, removed: 0, changed: 0, titleOnly: 0, collisions: 0 });
  assert.equal(brief.outcome, "permutation");
  assert.equal(brief.breaking, false);
  assert.equal(brief.tableDigest.before, brief.tableDigest.after);
});

test("missing --out-dir is engine refusal missing_out_dir", () => {
  const engine = getEngine("route-table-diff", loadCatalog());
  const { root } = ensureEngineRoot(engine);
  const spawned = spawnSync(
    process.execPath,
    [
      engineBin(engine, root),
      "--before",
      pinFixture("route-table-diff", "journey/before.json"),
      "--after",
      pinFixture("route-table-diff", "journey/after.json"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(spawned.status, 2);
  const body = JSON.parse(spawned.stdout);
  assert.equal(body.refused, true);
  assert.equal(body.code, "missing_out_dir");
});

test("loopback HTTP catalogs are local-runtime analysis", async () => {
  const server = spawn(
    process.execPath,
    [
      join(MODULE_ROOT, "fixtures/loopback-catalog-server.mjs"),
      pinFixture("route-table-diff", "journey/before.json"),
      pinFixture("route-table-diff", "journey/after.json"),
    ],
    { encoding: "utf8" },
  );
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("loopback catalog server did not print a port")), 5000);
    server.stdout.on("data", (chunk) => {
      clearTimeout(timer);
      resolve(String(chunk).trim());
    });
    server.once("error", reject);
  });
  try {
    const outDir = tmpOut("route-http");
    const result = invokeEngine({
      engineId: "route-table-diff",
      outDir,
      inputs: {
        before: `http://127.0.0.1:${port}/before.json`,
        after: `http://127.0.0.1:${port}/after.json`,
      },
    });
    assert.equal(result.outcome.kind, "analysis");
    assert.equal(result.stdoutJson.evidenceClass.before, "local-runtime");
    assert.equal(result.stdoutJson.counts.added, 1);
  } finally {
    server.kill("SIGTERM");
  }
});

test("Next.js-shaped JSON is not a claimed catalog format", () => {
  const catalog = loadCatalog();
  const engine = getEngine("route-table-diff", catalog);
  assert.equal(engine.acceptedInputs.notClaimed.includes("nextjs"), true);
  const result = invoke("route-table-diff", {
    before: join(MODULE_ROOT, "fixtures/route/nextjs-shaped.json"),
    after: join(MODULE_ROOT, "fixtures/route/nextjs-shaped.json"),
  });
  assert.equal(["analysis", "refused"].includes(result.outcome.kind), true);
  assert.notEqual(result.outcome.kind, "transport-failure");
});

test("duplicate path collision is analysis breaking, not a crash", () => {
  const result = invoke("route-table-diff", {
    before: pinFixture("route-table-diff", "comparison/collision-duplicate-path.json"),
    after: pinFixture("route-table-diff", "journey/before.json"),
  });
  assert.equal(result.outcome.kind, "analysis");
  assert.equal(result.stdoutJson.ok, true);
  assert.equal(result.stdoutJson.breaking, true);
  assert.equal(result.stdoutJson.outcome, "breaking");
});
