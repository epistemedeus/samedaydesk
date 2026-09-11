import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { loadCatalog } from "../lib/catalog.mjs";
import { REPO_ROOT, WRAPPER_CLI } from "../lib/paths.mjs";
import { tmpOut } from "./helpers.mjs";

test("SDS52 wrapper still runs vendor-budget-impact at the pinned wrapper SHA", () => {
  const catalog = loadCatalog();
  assert.equal(catalog.wrapperPin.sha, "aeef964fa188443078958d9d6d393afae1d542ee");
  const outDir = tmpOut("sds52-budget");
  const spawned = spawnSync(
    process.execPath,
    [
      WRAPPER_CLI,
      "run",
      "vendor-budget-impact",
      "--before",
      join(REPO_ROOT, "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json"),
      "--after",
      join(REPO_ROOT, "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json"),
      "--funding",
      "reserved-fixture",
      "--payment",
      join(REPO_ROOT, "server/paid-useful-jobs/fixtures/payment/reserved-fixture.json"),
      "--out-dir",
      outDir,
    ],
    { encoding: "utf8" },
  );
  assert.equal(spawned.status, 0, spawned.stderr);
  const body = JSON.parse(spawned.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.jobId, "vendor-budget-impact");
  assert.equal(body.engine.status, "actionable");
  assert.deepEqual(
    body.outputs.map((row) => row.name),
    ["budget-impact.json", "budget-impact.md"],
  );
  assert.equal(catalog.engines.some((engine) => engine.id === "vendor-budget-impact"), false);
});
