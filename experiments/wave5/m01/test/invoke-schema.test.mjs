import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { CatalogRefuse, getEngine } from "../lib/catalog.mjs";
import { invokeEngine } from "../lib/invoke.mjs";
import { OWNED_FIXTURES, invoke, pinFixture, tmpOut } from "./helpers.mjs";

test("schema journey reports amount type-change on used path only", () => {
  const outDir = tmpOut("schema-pos");
  const result = invoke("json-schema-webhook-drift", {
    before: pinFixture("json-schema-webhook-drift", "journey/before.json"),
    after: pinFixture("json-schema-webhook-drift", "journey/after.json"),
    used: pinFixture("json-schema-webhook-drift", "journey/used.json"),
  }, { outDir });
  assert.equal(result.outcome.kind, "analysis");
  assert.equal(result.stdoutJson.status, "actionable");
  assert.equal(result.stdoutJson.kind, "json-schema");
  assert.equal(result.stdoutJson.breaking, 1);
  assert.equal(result.schemaMatch.ok, true);
  const brief = JSON.parse(readFileSync(join(outDir, "drift-brief.json"), "utf8"));
  assert.equal(brief.schema, "samedaydesk.json-schema-webhook-drift.v1");
  assert.equal(brief.impact.breaking[0].pointer, "/properties/amount");
  assert.equal(brief.impact.breaking[0].reason, "type-change");
});

test("OpenAPI documents are refused as not-this-job, not analysis success", () => {
  const result = invoke("json-schema-webhook-drift", {
    before: pinFixture("json-schema-webhook-drift", "openapi-refuse/before.json"),
    after: pinFixture("json-schema-webhook-drift", "openapi-refuse/after.json"),
    used: pinFixture("json-schema-webhook-drift", "openapi-refuse/used.json"),
  });
  assert.equal(result.outcome.kind, "refused");
  assert.equal(result.refuseJson.code, "not-this-job-openapi");
  assert.equal(result.refuseJson.refused, true);
});

test("JSON Schema boolean false is boolean-schema-tightened", () => {
  const outDir = tmpOut("schema-false");
  const result = invoke("json-schema-webhook-drift", {
    before: join(OWNED_FIXTURES, "schema/false-before.json"),
    after: join(OWNED_FIXTURES, "schema/false-after.json"),
    used: join(OWNED_FIXTURES, "schema/used-x.json"),
  }, { outDir });
  assert.equal(result.outcome.kind, "analysis");
  const brief = JSON.parse(readFileSync(join(outDir, "drift-brief.json"), "utf8"));
  assert.equal(brief.status, "actionable");
  assert.equal(brief.impact.breaking[0].reason, "boolean-schema-tightened");
  assert.equal(brief.impact.breaking[0].after.kind, "boolean-schema");
  assert.equal(brief.impact.breaking[0].after.allows, false);
});

test("$ref sibling type is a used-path type-change, not ignored", () => {
  const result = invoke("json-schema-webhook-drift", {
    before: join(OWNED_FIXTURES, "schema/ref-before.json"),
    after: join(OWNED_FIXTURES, "schema/ref-after.json"),
    used: join(OWNED_FIXTURES, "schema/used-x.json"),
  });
  assert.equal(result.outcome.kind, "analysis");
  assert.equal(result.stdoutJson.status, "actionable");
  assert.equal(result.stdoutJson.breaking, 1);
});

test("non-integer minimum edit is numeric-tightened", () => {
  const result = invoke("json-schema-webhook-drift", {
    before: join(OWNED_FIXTURES, "schema/min-before.json"),
    after: join(OWNED_FIXTURES, "schema/min-after.json"),
    used: join(OWNED_FIXTURES, "schema/used-n.json"),
  });
  assert.equal(result.outcome.kind, "analysis");
  assert.equal(result.stdoutJson.status, "actionable");
  assert.equal(result.stdoutJson.breaking, 1);
});

test("required-field change at document root pointer empty string is required-added", () => {
  const outDir = tmpOut("schema-req");
  const result = invoke("json-schema-webhook-drift", {
    before: join(OWNED_FIXTURES, "schema/required-before.json"),
    after: join(OWNED_FIXTURES, "schema/required-after.json"),
    used: join(OWNED_FIXTURES, "schema/used-root.json"),
  }, { outDir });
  assert.equal(result.outcome.kind, "analysis");
  const brief = JSON.parse(readFileSync(join(outDir, "drift-brief.json"), "utf8"));
  assert.equal(brief.status, "actionable");
  assert.equal(brief.impact.breaking[0].reason, "required-added");
  assert.deepEqual(brief.impact.breaking[0].before.required, ["a"]);
  assert.deepEqual(brief.impact.breaking[0].after.required, ["a", "b"]);
});

test("unknown catalog id is a catalog refusal, not an engine crash", () => {
  assert.throws(
    () => invokeEngine({ engineId: "vendor-budget-impact", outDir: tmpOut("nope"), inputs: {} }),
    (err) => err instanceof CatalogRefuse && err.code === "unknown-engine",
  );
  const engine = getEngine("lockfile-pin-delta");
  assert.equal(engine.id, "lockfile-pin-delta");
});
