import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { mapExampleToM01, COMPOSITION_SHA, observedCompositionSha } from "../src/m01.mjs";
import { H04_ROOT } from "../src/paths.mjs";

const SUMMARY = join(H04_ROOT, "runs/m01-replay/summary.json");

test("M01 composition SHA is a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e and worktree matches", () => {
  assert.equal(COMPOSITION_SHA, "a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e");
  const observed = observedCompositionSha();
  if (observed) assert.equal(observed, COMPOSITION_SHA);
});

test("mapExampleToM01 sends lock/schema/page/route tables to four engines; OpenAPI stays SDS52", () => {
  assert.equal(mapExampleToM01({ family: "lockfile", engines: [] }).m01EngineId, "lockfile-pin-delta");
  assert.equal(mapExampleToM01({ family: "schema-webhook", engines: [] }).m01EngineId, "json-schema-webhook-drift");
  assert.equal(mapExampleToM01({ family: "page-facts", engines: [] }).m01EngineId, "page-change-offline-job");
  assert.equal(mapExampleToM01({ family: "api-routes", engines: ["w4-route-table-diff"] }).m01EngineId, "route-table-diff");
  const openapi = mapExampleToM01({
    family: "api-routes",
    engines: ["sds52-api-upgrade-brief"],
    inputs: { before: "./before.yaml" },
  });
  assert.equal(openapi.mapping, "not-in-m01-four");
  assert.equal(openapi.sds52Job, "api-upgrade-brief");
});

test("m01 replay summary exists with 11 replayed and recorded mapping skip for h04-route-02", () => {
  assert.equal(existsSync(SUMMARY), true, "run node bin/h04-benchmark.mjs m01");
  const summary = JSON.parse(readFileSync(SUMMARY, "utf8"));
  assert.equal(summary.compositionSha, COMPOSITION_SHA);
  assert.equal(summary.observedSha, COMPOSITION_SHA);
  assert.ok(summary.replayed >= 11, `replayed ${summary.replayed}`);
  const skip = (summary.mappingFailures || []).find((m) => m.id === "h04-route-02");
  assert.ok(skip, "h04-route-02 mapping failure recorded");
  assert.equal(skip.mapping, "not-in-m01-four");
  const lock = (summary.runs || []).find((r) => r.exampleId === "h04-lock-01");
  assert.ok(lock);
  assert.equal(lock.exitCode, 0);
  assert.equal(typeof lock.durationMs, "number");
});
