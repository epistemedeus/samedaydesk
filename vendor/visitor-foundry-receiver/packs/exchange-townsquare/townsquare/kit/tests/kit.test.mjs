import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runConversationToTask, PACKAGE_ID, SCHEMA } from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (n) => JSON.parse(readFileSync(join(root, "fixtures", n), "utf8"));

test("positive: conversation becomes scoped task via integrated modules", () => {
  const out = runConversationToTask(load("conversation.positive.json"));
  assert.equal(out.schema, SCHEMA);
  assert.equal(out.packageId, PACKAGE_ID);
  assert.equal(out.status, "ready");
  assert.equal(out.fabricatedUsers, false);
  assert.equal(out.execute, false);
  assert.ok(out.task.capabilityIds.length >= 1);
  assert.equal(out.task.adoptionRequired, true);
  assert.equal(out.stages.length, 7);
  assert.deepEqual(out.modulesIntegrated, ["01","02","03","04","05","06","07"]);
});

test("demo false rejected", () => {
  assert.throws(() => runConversationToTask(load("conversation.negative.json")), (e) => e.code === "synthetic_only");
});

test("forbidden revenue rejected", () => {
  assert.throws(() => runConversationToTask(load("conversation.forbidden.json")), (e) => e.code === "forbidden_claim");
});

test("partial empty capabilities still returns task structure", () => {
  const out = runConversationToTask(load("conversation.partial.json"));
  assert.equal(out.fabricatedUsers, false);
  assert.ok(out.stages.find((s) => s.packageId === "R2-TOWNSQUARE-01"));
});

test("execute always false on actions", () => {
  const out = runConversationToTask(load("conversation.positive.json"));
  for (const a of out.task.proposedActions) assert.equal(a.execute, false);
});
