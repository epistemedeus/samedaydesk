import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { firstOffer, loadCatalog, selectedEngines } from "../lib/catalog.mjs";
import { MODULE_ROOT, REPO_ROOT, WRAPPER_CLI } from "../lib/paths.mjs";

test("catalog loads with exactly one first offer from in-tree engines", () => {
  const catalog = loadCatalog();
  assert.equal(catalog.schema, "samedaydesk.wave5.m01.engine-catalog.v1");
  assert.equal(catalog.firstOffer, "lockfile-pin-delta");
  assert.equal(catalog.source, "in-tree");
  assert.equal(firstOffer(catalog).id, "lockfile-pin-delta");
  assert.equal(catalog.engines.filter((engine) => engine.firstOffer).length, 1);
  assert.deepEqual(
    selectedEngines(catalog).map((engine) => engine.id),
    ["lockfile-pin-delta", "json-schema-webhook-drift", "route-table-diff", "page-change-offline-job"],
  );
  assert.equal(catalog.engines[0].pin.sha, "fba9d14872bc4c04214e527b9edfb30c2123c9e7");
  assert.equal(catalog.d01Binding.testedWrapperSha, "6bed72dd22a396134aa5c957933b42c3a5746698");
});

test("CLI list firstOffer is lockfile and wrapper jobs stay the SDS52 six", () => {
  const catalogCli = spawnSync(process.execPath, [join(MODULE_ROOT, "bin/catalog.mjs"), "list"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.equal(catalogCli.status, 0, catalogCli.stderr);
  const listed = JSON.parse(catalogCli.stdout);
  assert.equal(listed.firstOffer, "lockfile-pin-delta");
  assert.equal(listed.source, "in-tree");
  assert.equal(listed.selected.length, 4);
  assert.equal(
    listed.selected.filter((row) => row.firstOffer).map((row) => row.id).join(),
    "lockfile-pin-delta",
  );
  assert.equal(listed.d01Binding, "wired-in-d01-default-executor");

  const wrapper = spawnSync(process.execPath, [WRAPPER_CLI, "list"], { encoding: "utf8" });
  assert.equal(wrapper.status, 0, wrapper.stderr);
  const wrapperList = JSON.parse(wrapper.stdout);
  assert.equal(wrapperList.firstOffer, "lockfile-pin-delta");
  assert.equal(wrapperList.jobs[0], "lockfile-pin-delta");
  assert.equal(wrapperList.jobs.includes("lockfile-pin-delta"), true);
  assert.equal(wrapperList.jobs.includes("vendor-budget-impact"), true);
  assert.equal(wrapperList.jobs.includes("page-change-offline-job"), true);
});

test("contract export lists accepted inputs and output files", () => {
  const catalogCli = spawnSync(process.execPath, [join(MODULE_ROOT, "bin/catalog.mjs"), "contract"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.equal(catalogCli.status, 0, catalogCli.stderr);
  const contract = JSON.parse(catalogCli.stdout);
  assert.equal(contract.schema, "samedaydesk.wave5.m01.job-catalog.v1");
  assert.equal(contract.firstOffer, "lockfile-pin-delta");
  const lock = contract.jobs.find((job) => job.id === "lockfile-pin-delta");
  assert.deepEqual(lock.outputs.map((row) => row.name), ["pin-delta.json", "pin-delta.md"]);
  assert.deepEqual(lock.acceptedInputs.formats, ["npm-package-lock-v2", "npm-package-lock-v3"]);
});
