import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copyFileSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { ensureProductRoot, productFixture } from "../lib/product.mjs";
import { stageLock, stagePage, stageRoute, stageSchema } from "../lib/fixtures.mjs";
import { outcomeOf, splitPrepareExecute } from "../lib/invoke.mjs";
import { runAfterPrepare } from "../lib/run.mjs";
import { KIND, classifyPrepareExecute, inputSha, receiptInputSha } from "../lib/classify.mjs";
import { listedBindings, orderJobPath, pageVerdict } from "../lib/bind.mjs";
import { sha256File } from "../lib/sha.mjs";

const root = ensureProductRoot();

function freezeLockLike({ jobId, fx, extraOps = [], extra = [] }) {
  const ops = [{ kind: "overwrite", target: fx.after, overlay: fx.overlay }, ...extraOps];
  const spawned = runAfterPrepare({ root, jobId, inputs: fx, ops, extra });
  assert.equal(spawned.flag?.mutated, true, JSON.stringify(spawned.flag));
  const liveSha = sha256File(fx.after);
  const classified = classifyPrepareExecute({
    inspectSha: fx.inspectAfter,
    liveSha,
    overlaySha: sha256File(fx.overlay),
    controlOutcome: "actionable",
    overlayOutcome: "informational",
    racedOutcome: outcomeOf(spawned.body),
    receiptSha: inputSha(spawned.body, "--after") || receiptInputSha(spawned.body, "after"),
    refused: spawned.body?.ok === false,
    refuseCode: spawned.body?.order?.code || spawned.body?.preflight?.code,
  });
  return { spawned, classified, liveSha };
}

describe("prepare→execute freeze via product deliver.mjs", { timeout: 180_000 }, () => {
  it("lock after.json overwrite after prepare is frozen-consumed", () => {
    const fx = stageLock(root);
    const { spawned, classified, liveSha } = freezeLockLike({ jobId: "lockfile-pin-delta", fx });
    assert.equal(spawned.status, 0, spawned.stderr + spawned.stdout.slice(0, 1500));
    assert.equal(classified.kind, KIND.FROZEN_CONSUMED);
    assert.equal(outcomeOf(spawned.body), "actionable");
    assert.equal(liveSha, sha256File(fx.overlay));
    assert.notEqual(liveSha, fx.inspectAfter);
    assert.equal(inputSha(spawned.body, "--after"), fx.inspectAfter);
  });

  it("lock after.json replaced by symlink after prepare is still frozen-consumed", () => {
    const fx = stageLock(root);
    const spawned = runAfterPrepare({
      root,
      jobId: "lockfile-pin-delta",
      inputs: fx,
      ops: [{ kind: "symlink", target: fx.after, overlay: fx.overlay }],
    });
    assert.equal(spawned.status, 0, spawned.stderr);
    assert.equal(lstatSync(fx.after).isSymbolicLink(), true);
    assert.equal(outcomeOf(spawned.body), "actionable");
    assert.equal(inputSha(spawned.body, "--after"), fx.inspectAfter);
    assert.equal(sha256File(fx.after), sha256File(fx.overlay));
  });

  it("schema after.json overwrite after prepare stays actionable", () => {
    const fx = stageSchema(root, "changed");
    const spawned = runAfterPrepare({
      root,
      jobId: "json-schema-webhook-drift",
      inputs: fx,
      ops: [{ kind: "overwrite", target: fx.after, overlay: fx.overlay }],
    });
    assert.equal(spawned.status, 0, spawned.stderr);
    assert.equal(outcomeOf(spawned.body), "actionable");
    assert.equal(inputSha(spawned.body, "--after"), fx.inspectAfter);
    assert.equal(sha256File(fx.after), sha256File(fx.overlay));
  });

  it("schema used.json overwrite after prepare stays on inspected used-path", () => {
    const fx = stageSchema(root, "changed");
    const overlayUsed = join(fx.dir, "overlay-used.json");
    copyFileSync(productFixture(root, "experiments/wave5/m01/fixtures/schema/used-x.json"), overlayUsed);
    const spawned = runAfterPrepare({
      root,
      jobId: "json-schema-webhook-drift",
      inputs: fx,
      ops: [{ kind: "overwrite", target: fx.used, overlay: overlayUsed }],
    });
    assert.equal(spawned.status, 0, spawned.stderr);
    assert.equal(outcomeOf(spawned.body), "actionable");
    assert.equal(inputSha(spawned.body, "--used"), fx.inspectUsed);
    assert.notEqual(sha256File(fx.used), fx.inspectUsed);
  });

  it("route after.json overwrite after prepare is frozen-consumed", () => {
    const fx = stageRoute(root);
    const { spawned, classified } = freezeLockLike({ jobId: "route-table-diff", fx });
    assert.equal(spawned.status, 0, spawned.stderr);
    assert.equal(classified.kind, KIND.FROZEN_CONSUMED);
    assert.equal(outcomeOf(spawned.body), "actionable");
  });

  it("--http lock overwrite after prepare still executes inspected bytes", () => {
    const fx = stageLock(root);
    const spawned = runAfterPrepare({
      root,
      jobId: "lockfile-pin-delta",
      inputs: fx,
      ops: [{ kind: "overwrite", target: fx.after, overlay: fx.overlay }],
      extra: ["--http"],
    });
    assert.equal(spawned.status, 0, spawned.stderr);
    assert.match(String(spawned.body.executeUrl), /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(outcomeOf(spawned.body), "actionable");
    assert.equal(inputSha(spawned.body, "--after"), fx.inspectAfter);
  });

  it("page capture overwrite after prepare is race-consumed-mutated", () => {
    const fx = stagePage(root);
    const spawned = runAfterPrepare({
      root,
      jobId: "page-change-offline-job",
      inputs: fx,
      ops: [{ kind: "overwrite", target: fx.after, overlay: fx.overlay }],
    });
    assert.equal(spawned.status, 0, spawned.stderr + spawned.stdout.slice(0, 1500));
    assert.equal(spawned.flag?.mutated, true);
    assert.equal(outcomeOf(spawned.body), "informational");
    assert.equal(pageVerdict(spawned.body.runOutDir), "unchanged");
    assert.equal(sha256File(fx.after), sha256File(fx.overlay));
    assert.notEqual(fx.inspectAfter, sha256File(fx.overlay));
    const classified = classifyPrepareExecute({
      inspectSha: fx.inspectAfter,
      liveSha: sha256File(fx.after),
      overlaySha: sha256File(fx.overlay),
      controlOutcome: "actionable",
      overlayOutcome: "informational",
      racedOutcome: outcomeOf(spawned.body),
      receiptSha: inputSha(spawned.body, "--job"),
      refused: false,
    });
    assert.equal(classified.kind, KIND.RACE_CONSUMED_MUTATED);
    assert.equal(orderJobPath(spawned.body), fx.job);
    const bound = listedBindings(spawned.body, [
      { name: "job", sha256: fx.inspectJob },
      { name: "after-capture", sha256: fx.inspectAfter },
      { name: "overlay-capture", sha256: sha256File(fx.overlay) },
    ]);
    const job = bound.find((row) => row.name === "job");
    const capture = bound.find((row) => row.name === "after-capture");
    const overlay = bound.find((row) => row.name === "overlay-capture");
    assert.equal(job.inOrderInputs, true);
    assert.equal(job.inReceiptInputs, true);
    assert.equal(capture.inOrderInputs, false);
    assert.equal(capture.inReceiptInputs, false);
    assert.equal(capture.inMailboxEnvelope, false);
    assert.equal(overlay.inOrderInputs, false);
    assert.equal(overlay.inSerializedDelivery, false);
  });

  it("page capture symlink after prepare is the same race", () => {
    const fx = stagePage(root);
    const spawned = runAfterPrepare({
      root,
      jobId: "page-change-offline-job",
      inputs: fx,
      ops: [{ kind: "symlink", target: fx.after, overlay: fx.overlay }],
    });
    assert.equal(spawned.status, 0, spawned.stderr);
    assert.equal(lstatSync(fx.after).isSymbolicLink(), true);
    assert.equal(outcomeOf(spawned.body), "informational");
    assert.equal(pageVerdict(spawned.body.runOutDir), "unchanged");
  });

  it("page job.json overwrite after prepare is fail-closed f-input", () => {
    const fx = stagePage(root);
    const spawned = runAfterPrepare({
      root,
      jobId: "page-change-offline-job",
      inputs: fx,
      ops: [{ kind: "overwrite", target: fx.job, overlay: fx.mutatedJob }],
    });
    assert.equal(spawned.status, 2);
    assert.equal(spawned.body.ok, false);
    assert.equal(spawned.body.stage, "order");
    assert.equal(spawned.body.order.code, "f-input");
    assert.equal(sha256File(fx.job), sha256File(fx.mutatedJob));
    assert.notEqual(fx.inspectJob, sha256File(fx.job));
  });

  it("split preflight→mutate→runCreateOrder reproduces the page-capture race without the loader", async () => {
    const fx = stagePage(root);
    const split = await splitPrepareExecute({
      root,
      jobId: "page-change-offline-job",
      inputs: { job: fx.job },
      mutate() {
        copyFileSync(fx.overlay, fx.after);
      },
    });
    assert.equal(split.pre.ok, true);
    assert.equal(split.order.ok, true);
    assert.equal(split.order.wrapper.analysis.outcome, "informational");
    assert.equal(split.raw.inputs[0].path, fx.job);
    assert.equal(split.raw.inputs.some((row) => row.sha256 === fx.inspectAfter), false);
  });
});
