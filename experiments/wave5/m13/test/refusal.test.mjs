import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { classifySpawn } from "../src/classify.mjs";
import { discoverThenInvoke } from "../src/index.mjs";
import { invokeCurrentJob } from "../src/invoke.mjs";
import { defaultDocumentPaths, findRepoRoot } from "../src/paths.mjs";

test("unknown catalog job is analysis refusal, not transport", async () => {
  const result = await discoverThenInvoke({ jobId: "not-a-real-job" });
  assert.equal(result.ok, false);
  assert.equal(result.failureClass, "analysis");
  assert.equal(result.outcome, "refusal");
  assert.equal(result.code, "unknown-job");
  assert.equal(result.invoke, null);
});

test("wrapper unknown-job CLI is structured analysis refusal (exit 2)", () => {
  const root = findRepoRoot();
  const cli = defaultDocumentPaths(root).wrapperCli;
  const classified = invokeCurrentJob({ repoRoot: root, cli, jobId: "not-a-real-job" });
  assert.equal(classified.failureClass, "analysis");
  assert.equal(classified.outcome, "refusal");
  assert.equal(classified.code, "unknown-job");
  assert.equal(classified.body.ok, false);
  assert.equal(classified.body.sold, false);
  assert.equal(classified.status, 2);
});

test("missing required inputs is analysis refusal, not a crash", () => {
  const root = findRepoRoot();
  const cli = defaultDocumentPaths(root).wrapperCli;
  const classified = invokeCurrentJob({
    repoRoot: root,
    cli,
    jobId: "vendor-budget-impact",
  });
  assert.equal(classified.failureClass, "analysis");
  assert.equal(classified.outcome, "refusal");
  assert.equal(classified.code, "missing-required-inputs");
  assert.equal(classified.body.sold, false);
  assert.equal(classified.status, 2);
});

test("missing wrapper CLI is transport, distinct from analysis refusal", () => {
  const root = findRepoRoot();
  const classified = invokeCurrentJob({
    repoRoot: root,
    cli: join(root, "experiments/wave5/m13/fixtures/no-such-cli.mjs"),
    jobId: "vendor-budget-impact",
  });
  assert.equal(classified.failureClass, "transport");
  assert.equal(classified.outcome, "start-failure");
  assert.equal(classified.code, "cli-missing");
});

test("non-JSON stdout is transport, not a valid refusal artifact", () => {
  const classified = classifySpawn({
    status: 1,
    stdout: "Segmentation fault",
    stderr: "",
    error: null,
    signal: null,
  });
  assert.equal(classified.failureClass, "transport");
  assert.equal(classified.outcome, "non-json");
  assert.equal(classified.code, "non-json-stdout");
});

test("--example is labelled sample refusal, not a sale", async () => {
  const root = findRepoRoot();
  const dir = join(root, "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact");
  const result = await discoverThenInvoke({
    jobId: "vendor-budget-impact",
    inputs: { before: join(dir, "before.json"), after: join(dir, "after.json") },
    example: true,
    funding: "reserved-fixture",
    payment: join(root, "server/paid-useful-jobs/fixtures/payment/reserved-fixture.json"),
  });
  assert.equal(result.ok, false);
  assert.equal(result.failureClass, "analysis");
  assert.equal(result.outcome, "refusal");
  assert.equal(result.invoke.body.sample, true);
  assert.equal(result.sold, false);
  assert.equal(result.invoke.body.code, "sample-not-a-sale");
});

test("garbage JSON input is engine or analysis, never sold and never transport-success", () => {
  const root = findRepoRoot();
  const cli = defaultDocumentPaths(root).wrapperCli;
  const work = mkdtempSync(join(tmpdir(), "w5-m13-garbage-"));
  const before = join(work, "before.json");
  const after = join(work, "after.json");
  writeFileSync(before, "{not-json");
  writeFileSync(after, "{not-json");
  const classified = invokeCurrentJob({
    repoRoot: root,
    cli,
    jobId: "vendor-budget-impact",
    inputs: { before, after },
  });
  assert.notEqual(classified.failureClass, "transport");
  assert.equal(classified.body?.sold === true, false);
  assert.ok(classified.outcome === "refusal" || classified.outcome === "success");
});
