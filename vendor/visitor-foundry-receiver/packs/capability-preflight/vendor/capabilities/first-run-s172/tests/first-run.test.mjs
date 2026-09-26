import assert from "node:assert/strict";
import { test } from "node:test";
import { runFirstUse, runCatalogOnlyFirstUse } from "../src/first-run.mjs";
import { HEAVY_PIN } from "../src/constants.mjs";

test("ready path: probe-ready + content_bound + complete compose; never release", () => {
  const r = runFirstUse({ clock: () => Date.parse("2026-09-10T12:48:30.000Z") });
  assert.equal(r.heavyPin, HEAVY_PIN);
  assert.equal(r.stages.envelope.status, "ready");
  assert.equal(r.stages.prerequisites.readiness, "ready");
  assert.equal(r.stages.evidence.status, "content_bound");
  assert.equal(r.stages.evidence.executionVerified, false);
  assert.equal(r.stages.partialResult.status, "complete");
  assert.equal(r.firstUseStatus, "utility_ok_not_release");
  assert.equal(r.accepted, false);
  assert.equal(r.readyForRelease, false);
  assert.equal(r.honesty.executionVerified, false);
  assert.equal(r.honesty.s164SourceRewrite, false);
});

test("catalog-only preserves not_ready; evidence still content_bound with executionVerified false", () => {
  const r = runCatalogOnlyFirstUse({ clock: () => Date.parse("2026-09-10T12:48:30.000Z") });
  assert.notEqual(r.stages.prerequisites.readiness, "ready");
  assert.equal(r.stages.evidence.status, "content_bound");
  assert.equal(r.stages.evidence.executionVerified, false);
  assert.equal(r.readyForRelease, false);
  assert.equal(r.firstUseStatus, "partial_first_use");
});

test("compose rejects non-complete part status (hole preserved)", () => {
  const r = runFirstUse({
    clock: () => Date.parse("2026-09-10T12:48:30.000Z"),
    parts: [
      { id: "a", status: "ok", schema: "demo.job.v1", scope: "neo-labs", payload: { title: "Example", status: "x" } },
    ],
  });
  assert.notEqual(r.stages.partialResult.status, "complete");
  assert.equal(r.readyForRelease, false);
});
