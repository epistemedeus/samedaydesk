import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { firstOffer, loadCatalog, selectedEngines } from "../lib/catalog.mjs";
import { MODULE_ROOT, REPO_ROOT, WRAPPER_CLI } from "../lib/paths.mjs";

test("catalog loads with exactly one first offer", () => {
  const catalog = loadCatalog();
  assert.equal(catalog.schema, "samedaydesk.wave5.m01.engine-catalog.v1");
  assert.equal(catalog.firstOffer, "lockfile-pin-delta");
  assert.equal(firstOffer(catalog).id, "lockfile-pin-delta");
  assert.equal(catalog.engines.filter((engine) => engine.firstOffer).length, 1);
  assert.deepEqual(
    selectedEngines(catalog).map((engine) => engine.id),
    ["lockfile-pin-delta", "json-schema-webhook-drift", "route-table-diff", "page-change-offline-job"],
  );
});

test("CLI list firstOffer is lockfile and wrapper jobs stay the SDS52 six", () => {
  const catalogCli = spawnSync(process.execPath, [join(MODULE_ROOT, "bin/catalog.mjs"), "list"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.equal(catalogCli.status, 0, catalogCli.stderr);
  const listed = JSON.parse(catalogCli.stdout);
  assert.equal(listed.firstOffer, "lockfile-pin-delta");
  assert.equal(listed.selected.length, 4);
  assert.equal(
    listed.selected.filter((row) => row.firstOffer).map((row) => row.id).join(),
    "lockfile-pin-delta",
  );

  const wrapper = spawnSync(process.execPath, [WRAPPER_CLI, "list"], { encoding: "utf8" });
  assert.equal(wrapper.status, 0, wrapper.stderr);
  const wrapperList = JSON.parse(wrapper.stdout);
  assert.deepEqual(wrapperList.jobs, [
    "api-upgrade-brief",
    "vendor-budget-impact",
    "feed-agenda",
    "evidence-ci-annotation",
    "listing-repair-packet",
    "repeat-job-record",
  ]);
  assert.equal(wrapperList.jobs.includes("lockfile-pin-delta"), false);
});
