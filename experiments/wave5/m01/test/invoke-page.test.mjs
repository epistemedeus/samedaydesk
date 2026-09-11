import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { invokeEngine } from "../lib/invoke.mjs";
import { invoke, pinFixture, tmpOut } from "./helpers.mjs";

test("page-change customer job is changed analysis with nested report schema", () => {
  const outDir = tmpOut("page-pos");
  const result = invoke("page-change-offline-job", {
    job: pinFixture("page-change-offline-job", "customer-job/job.json"),
  }, { outDir });
  assert.equal(result.outcome.kind, "analysis");
  assert.equal(result.schemaMatch.ok, true);
  assert.equal(result.stdoutJson.report.verdict, "changed");
  assert.equal(result.stdoutJson.report.schema, "pilot/page-change-brief/v1");
  assert.equal(result.stdoutJson.report.claims.usefulOutputProven, true);
  assert.equal(result.stdoutJson.report.claims.complete, false);
  const file = JSON.parse(readFileSync(join(outDir, "page-change.json"), "utf8"));
  assert.equal(file.report.verdict, "changed");
  assert.equal(Object.hasOwn(file, "ok"), false);
});

test("unchanged selected fields are valid analysis, not a failure", () => {
  const result = invoke("page-change-offline-job", {
    job: pinFixture("page-change-offline-job", "unchanged/job.json"),
  });
  assert.equal(result.outcome.kind, "analysis");
  assert.equal(result.stdoutJson.report.verdict, "unchanged");
  assert.equal(result.stdoutJson.report.claims.noChangeProven, true);
});

test("live fetch URL refuses on stderr with live_fetch_url", () => {
  const result = invokeEngine({
    engineId: "page-change-offline-job",
    outDir: tmpOut("page-live"),
    mode: "compare",
    inputs: {
      before: "http://127.0.0.1:9/before.json",
      after: pinFixture("page-change-offline-job", "customer-job/after.json"),
      fields: "title",
      clock: "2026-09-08T12:00:00.000Z",
    },
  });
  assert.equal(result.outcome.kind, "refused");
  assert.equal(result.refuseJson.code, "live_fetch_url");
  assert.equal(result.refuseJson.ok, false);
  assert.equal(Object.hasOwn(result.refuseJson, "refused"), false);
  assert.equal(result.spawn.stdout.trim(), "");
  assert.equal(result.spawn.status, 2);
});

test("tiny max-bytes is input_bounds refusal, not truncated success", () => {
  const result = invokeEngine({
    engineId: "page-change-offline-job",
    outDir: tmpOut("page-tiny"),
    inputs: {
      job: pinFixture("page-change-offline-job", "customer-job/job.json"),
      maxBytes: 10,
    },
  });
  assert.equal(result.outcome.kind, "refused");
  assert.equal(result.refuseJson.code, "input_bounds");
  assert.equal(result.spawn.status, 2);
});

test("stale snapshots stay analysis with freshness stale, not a crash", () => {
  const result = invokeEngine({
    engineId: "page-change-offline-job",
    outDir: tmpOut("page-stale"),
    mode: "compare",
    inputs: {
      before: pinFixture("page-change-offline-job", "unchanged/before.json"),
      after: pinFixture("page-change-offline-job", "unchanged/after.json"),
      fields: "title,description",
      clock: "2026-09-08T12:00:00.000Z",
      maxStaleMs: 1000,
    },
  });
  assert.equal(result.outcome.kind, "analysis");
  assert.equal(result.stdoutJson.report.verdict, "unchanged");
  assert.equal(result.stdoutJson.report.freshness, "stale");
  assert.equal(result.stdoutJson.ok, true);
});
