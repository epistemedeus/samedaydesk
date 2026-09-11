import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { CATALOG_PATH, QUICKSTART_SCHEMA } from "../lib/paths.mjs";
import { preview, previewJson } from "./helpers.mjs";

describe("m14 machine-first quickstart", () => {
  it("JSON quickstart lists the live catalog jobs and required flags", () => {
    const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
    const r = previewJson(["quickstart"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(r.json.schema, QUICKSTART_SCHEMA);
    assert.equal(r.json.purchaseAuthority, false);
    assert.equal(r.json.liveSettlement, "out-of-scope");
    assert.equal(r.json.testedImplementation.sha, "aeef964fa188443078958d9d6d393afae1d542ee");
    assert.deepEqual(
      r.json.jobs.map((j) => j.id),
      catalog.jobs.map((j) => j.id),
    );
    for (const job of catalog.jobs) {
      const row = r.json.jobs.find((j) => j.id === job.id);
      assert.deepEqual(row.requiredInputs, job.requiredInputs);
      assert.deepEqual(row.outputs, job.outputs);
    }
    assert.ok(r.json.commands.wrapperRun.includes("server/paid-useful-jobs/bin/cli.mjs"));
    assert.ok(r.json.remainingBinding.D24.exportedOnThisBranch === false);
    assert.ok(r.json.remainingBinding.M01.exportedOnThisBranch === false);
  });

  it("text quickstart is a how-to, not a sale, and names the wrapper CLI", () => {
    const r = preview(["quickstart", "--format", "text"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /node server\/paid-useful-jobs\/bin\/cli\.mjs/);
    assert.match(r.stdout, /node experiments\/wave5\/m14\/bin\/preview\.mjs/);
    assert.match(r.stdout, /Not a live sale/);
    assert.match(r.stdout, /vendor-budget-impact/);
    assert.doesNotMatch(r.stdout, /sold=true/);
  });

  it("help is usage, not a passing analysis", () => {
    const r = preview(["help"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /quickstart/);
    assert.match(r.stdout, /choose/);
  });
});
