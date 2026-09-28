import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  d01Root,
  feedAgendaArgs,
  readReceipt,
  satisfy,
  spawnPaidWrapperAsync,
  tempDir,
  vendorBudgetArgs,
} from "./helpers.mjs";

describe("simultaneous jobs cannot satisfy each other", { timeout: 180_000 }, () => {
  it("two isolated wrapper children cannot satisfy each other's package", async () => {
    const dirA = tempDir("w5-d18-sim-a-");
    const dirB = tempDir("w5-d18-sim-b-");
    const root = d01Root();
    const childA = spawnPaidWrapperAsync({
      d01Root: root,
      jobId: "vendor-budget-impact",
      extraArgs: vendorBudgetArgs(root),
      outDir: dirA,
    });
    const childB = spawnPaidWrapperAsync({
      d01Root: root,
      jobId: "feed-agenda",
      extraArgs: feedAgendaArgs(root),
      outDir: dirB,
    });
    const [a, b] = await Promise.all([childA.wait(), childB.wait()]);
    assert.equal(a.status, 0, a.stderr + a.stdout);
    assert.equal(b.status, 0, b.stderr + b.stdout);
    assert.equal(a.json?.ok, true);
    assert.equal(b.json?.ok, true);

    const receiptA = readReceipt(dirA);
    const receiptB = readReceipt(dirB);

    const aOk = await satisfy(dirA, "vendor-budget-impact", {
      expectedInputsDigest: receiptA.inputsDigest,
      evidenceClass: "local-runtime",
    });
    const bOk = await satisfy(dirB, "feed-agenda", {
      expectedInputsDigest: receiptB.inputsDigest,
      evidenceClass: "local-runtime",
    });
    assert.equal(aOk.ok, true, JSON.stringify(aOk));
    assert.equal(bOk.ok, true, JSON.stringify(bOk));

    const aAsB = await satisfy(dirA, "feed-agenda", { evidenceClass: "local-runtime" });
    const bAsA = await satisfy(dirB, "vendor-budget-impact", { evidenceClass: "local-runtime" });
    assert.equal(aAsB.ok, false);
    assert.equal(aAsB.code, "foreign-job-artifacts");
    assert.equal(bAsA.ok, false);
    assert.equal(bAsA.code, "foreign-job-artifacts");
  });

  it("two wrapper children sharing one outDir cannot both be satisfied from that directory", async () => {
    const shared = tempDir("w5-d18-sim-shared-");
    const root = d01Root();
    const childA = spawnPaidWrapperAsync({
      d01Root: root,
      jobId: "vendor-budget-impact",
      extraArgs: vendorBudgetArgs(root),
      outDir: shared,
    });
    const childB = spawnPaidWrapperAsync({
      d01Root: root,
      jobId: "feed-agenda",
      extraArgs: feedAgendaArgs(root),
      outDir: shared,
    });
    const [a, b] = await Promise.all([childA.wait(), childB.wait()]);
    assert.equal(a.status, 0, a.stderr + a.stdout);
    assert.equal(b.status, 0, b.stderr + b.stdout);

    const asA = await satisfy(shared, "vendor-budget-impact", { evidenceClass: "local-runtime" });
    const asB = await satisfy(shared, "feed-agenda", { evidenceClass: "local-runtime" });
    assert.equal(asA.satisfied && asB.satisfied, false);
    assert.ok(!asA.ok || !asB.ok);
    if (asA.ok) {
      assert.equal(asB.code, "foreign-job-artifacts");
      assert.ok(asA.foreignSiblingArtifacts.some((s) => s.jobId === "feed-agenda"));
    } else if (asB.ok) {
      assert.equal(asA.code, "foreign-job-artifacts");
      assert.ok(asB.foreignSiblingArtifacts.some((s) => s.jobId === "vendor-budget-impact"));
    } else {
      assert.ok(["partial-artifact-set", "incomplete-package"].includes(asA.reason) || asA.code);
      assert.ok(["partial-artifact-set", "incomplete-package"].includes(asB.reason) || asB.code);
    }
  });
});
