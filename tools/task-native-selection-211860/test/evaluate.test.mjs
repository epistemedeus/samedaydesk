import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { selectTask } from "../src/select.mjs";
import { validateInstance } from "../src/schema-support.mjs";

const catalogPath = new URL("../acquired/normalized.json", import.meta.url);
const tasks = ["recoverable-receipt", "free-readiness", "structured-extract", "careers-rows", "no-fit-flight"];

function load(name) {
  return JSON.parse(readFileSync(new URL(`../fixtures/tasks/${name}.json`, import.meta.url), "utf8"));
}

test("acquired public catalog selects the grounded tasks", { skip: !existsSync(catalogPath) }, () => {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const receipt = selectTask({ catalog, task: load("recoverable-receipt"), now: "2026-10-11T10:40:00.000Z" });
  const readiness = selectTask({ catalog, task: load("free-readiness"), now: "2026-10-11T10:40:00.000Z" });
  const extract = selectTask({ catalog, task: load("structured-extract"), now: "2026-10-11T10:40:00.000Z" });
  const careers = selectTask({ catalog, task: load("careers-rows"), now: "2026-10-11T10:40:00.000Z" });
  const missing = selectTask({ catalog, task: load("no-fit-flight"), now: "2026-10-11T10:40:00.000Z" });
  assert.equal(receipt.stages.selected.operationId, "claimReceiptReferralRecheck");
  assert.equal(receipt.stages.selected.cost.state, "unknown");
  assert.equal(readiness.stages.selected.entryId, "discovery:task-readiness");
  assert.equal(readiness.stages.selected.cost.state, "known_free");
  assert.equal(extract.stages.selected.operationId, "extractUrl");
  assert.equal(extract.stages.selected.cost.amount, "0.005");
  const summaryFields = selectTask({ catalog, task: load("extract-summary-fields"), now: "2026-10-11T10:40:00.000Z" });
  assert.equal(summaryFields.stages.selected.state, "no_fit");
  const extractRow = summaryFields.stages.render.ineligible.find((row) => row.operationId === "extractUrl");
  assert.equal(extractRow.reasons.includes("path_optional:jsonLd"), true);
  assert.equal(careers.stages.selected.operationId, "readNamedCareersBoard");
  assert.equal(missing.stages.selected.state, "no_fit");
  assert.equal(tasks.length, 5);
});

test("acquired careers cold body matches its declared schema", { skip: !existsSync(new URL("../acquired/sources/careers-cold.json", import.meta.url)) }, () => {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const body = JSON.parse(readFileSync(new URL("../acquired/sources/careers-cold.json", import.meta.url), "utf8"));
  const entry = catalog.entries.find((item) => item.operationId === "getCareersBoardColdRecipe");
  const checked = validateInstance(entry.outputSchema, body);
  assert.equal(checked.ok, true);
  assert.equal(body.charged, false);
  assert.equal(entry.price.state === "known_free", false);
});
