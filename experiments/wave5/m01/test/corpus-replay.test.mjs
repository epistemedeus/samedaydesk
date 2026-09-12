import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCatalog } from "../lib/catalog.mjs";
import { invoke, pinFixture } from "./helpers.mjs";

test("first offer stays lockfile after independent corpus replay", () => {
  const catalog = loadCatalog();
  assert.equal(catalog.firstOffer, "lockfile-pin-delta");
  assert.match(catalog.firstOfferRationale, /M07/);
  assert.equal(catalog.liveCatalog.action, "republished-in-useful-jobs-1.1.0");
});

test("schema used-path type-change remains actionable analysis", () => {
  const result = invoke("json-schema-webhook-drift", {
    before: pinFixture("json-schema-webhook-drift", "journey/before.json"),
    after: pinFixture("json-schema-webhook-drift", "journey/after.json"),
    used: pinFixture("json-schema-webhook-drift", "journey/used.json"),
  });
  assert.equal(result.outcome.kind, "analysis");
  assert.equal(result.stdoutJson.breaking, 1);
});

test("array items true to false is breaking on the imported schema engine", () => {
  const result = invoke("json-schema-webhook-drift", {
    before: pinFixture("json-schema-webhook-drift", "compatibility/items-true-to-false/before.json"),
    after: pinFixture("json-schema-webhook-drift", "compatibility/items-true-to-false/after.json"),
    used: pinFixture("json-schema-webhook-drift", "compatibility/items-true-to-false/used.json"),
  });
  assert.equal(result.outcome.kind, "analysis");
  assert.equal(result.stdoutJson.breaking, 1);
});

test("page noise-equivalent unchanged job is analysis, not failure", () => {
  const result = invoke("page-change-offline-job", {
    job: pinFixture("page-change-offline-job", "unchanged/job.json"),
  });
  assert.equal(result.outcome.kind, "analysis");
  assert.equal(result.stdoutJson.report.verdict, "unchanged");
});

test("OpenAPI schema input refuses without crashing", () => {
  const result = invoke("json-schema-webhook-drift", {
    before: pinFixture("json-schema-webhook-drift", "openapi-refuse/before.json"),
    after: pinFixture("json-schema-webhook-drift", "openapi-refuse/after.json"),
    used: pinFixture("json-schema-webhook-drift", "openapi-refuse/used.json"),
  });
  assert.equal(result.outcome.kind, "refused");
  assert.equal(result.refuseJson.code, "not-this-job-openapi");
});
