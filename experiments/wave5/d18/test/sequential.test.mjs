import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  d01Fixture,
  d01Root,
  hasFile,
  readReceipt,
  runFeedAgenda,
  runVendorBudget,
  satisfy,
  tempDir,
  vendorBudgetNoChangeArgs,
} from "./helpers.mjs";

describe("sequential jobs cannot satisfy each other with leftover artifacts", { timeout: 180_000 }, () => {
  it("reused outDir leaves job A files that cannot satisfy A after job B overwrites the receipt", async () => {
    const shared = tempDir("w5-d18-seq-shared-");
    const first = runVendorBudget(shared);
    assert.equal(first.status, 0, first.stderr + first.stdout);
    const firstReceipt = readReceipt(shared);
    const firstInputs = firstReceipt.inputsDigest;
    const firstOutputs = firstReceipt.outputsDigest;

    const isolatedCopy = join(tempDir("w5-d18-seq-keep-a-"), "a");
    cpSync(shared, isolatedCopy, { recursive: true });

    const second = runFeedAgenda(shared);
    assert.equal(second.status, 0, second.stderr + second.stdout);
    assert.equal(hasFile(shared, "budget-impact.json"), true);
    assert.equal(hasFile(shared, "budget-impact.md"), true);
    assert.equal(hasFile(shared, "agenda.json"), true);
    assert.equal(hasFile(shared, "agenda.ics"), true);

    const leftoverA = await satisfy(shared, "vendor-budget-impact", {
      expectedInputsDigest: firstInputs,
      evidenceClass: "local-runtime",
    });
    assert.equal(leftoverA.ok, false, JSON.stringify(leftoverA));
    assert.equal(leftoverA.satisfied, false);
    assert.equal(leftoverA.code, "foreign-job-artifacts");
    assert.equal(leftoverA.completeness.jobId, "feed-agenda");
    assert.ok(leftoverA.foreignSiblingArtifacts.some((s) => s.name === "agenda.json"));

    const secondReceipt = readReceipt(shared);
    const jobB = await satisfy(shared, "feed-agenda", {
      expectedInputsDigest: secondReceipt.inputsDigest,
      evidenceClass: "local-runtime",
    });
    assert.equal(jobB.ok, true, JSON.stringify(jobB));
    assert.equal(jobB.satisfied, true);
    assert.equal(jobB.mixedDirectory, true);
    assert.ok(jobB.foreignSiblingArtifacts.some((s) => s.jobId === "vendor-budget-impact"));

    const keptA = await satisfy(isolatedCopy, "vendor-budget-impact", {
      expectedInputsDigest: firstInputs,
      expectedOutputsDigest: firstOutputs,
      evidenceClass: "local-runtime",
    });
    assert.equal(keptA.ok, true, JSON.stringify(keptA));

    const leftoversOnly = join(tempDir("w5-d18-seq-leftover-only-"), "a");
    mkdirSync(leftoversOnly, { recursive: true });
    cpSync(join(shared, "budget-impact.json"), join(leftoversOnly, "budget-impact.json"));
    cpSync(join(shared, "budget-impact.md"), join(leftoversOnly, "budget-impact.md"));
    const noReceipt = await satisfy(leftoversOnly, "vendor-budget-impact", { evidenceClass: "fixture" });
    assert.equal(noReceipt.ok, false);
    assert.equal(noReceipt.reason, "partial-artifact-set");
    assert.equal(noReceipt.code, "missing-receipt");
  });

  it("a complete package for input set A cannot satisfy the same job id with a different inspected inputsDigest", async () => {
    const changeDir = tempDir("w5-d18-seq-change-");
    const noChangeDir = tempDir("w5-d18-seq-nochange-");
    const change = runVendorBudget(changeDir);
    const noChange = runVendorBudget(noChangeDir, vendorBudgetNoChangeArgs());
    assert.equal(change.status, 0, change.stderr + change.stdout);
    assert.equal(noChange.status, 0, noChange.stderr + noChange.stdout);
    assert.equal(change.json?.ok, true);
    assert.equal(noChange.json?.ok, true);

    const changeArt = JSON.parse(readFileSync(join(changeDir, "budget-impact.json"), "utf8"));
    const noChangeArt = JSON.parse(readFileSync(join(noChangeDir, "budget-impact.json"), "utf8"));
    assert.equal(changeArt.status, "actionable");
    assert.equal(noChangeArt.status, "informational");
    assert.notEqual(changeArt.underlying.counts.fieldChanges, noChangeArt.underlying.counts.fieldChanges);

    const changeReceipt = readReceipt(changeDir);
    const noChangeReceipt = readReceipt(noChangeDir);
    assert.notEqual(changeReceipt.inputsDigest, noChangeReceipt.inputsDigest);

    const stale = await satisfy(changeDir, "vendor-budget-impact", {
      expectedInputsDigest: noChangeReceipt.inputsDigest,
      evidenceClass: "local-runtime",
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.code, "stale-inputs-digest");
    assert.equal(stale.satisfied, false);

    const validNoChange = await satisfy(noChangeDir, "vendor-budget-impact", {
      expectedInputsDigest: noChangeReceipt.inputsDigest,
      evidenceClass: "local-runtime",
    });
    assert.equal(validNoChange.ok, true, JSON.stringify(validNoChange));
    assert.equal(validNoChange.satisfied, true);
  });

  it("valid missing-input refusal is not a complete delivery and cannot satisfy the job", async () => {
    const outDir = tempDir("w5-d18-seq-refuse-");
    const refused = runVendorBudget(outDir, [
      "--before",
      d01Fixture(d01Root(), "caller/vendor-budget-impact/before.json"),
      "--funding",
      "unfunded",
    ]);
    assert.equal(refused.status, 2);
    assert.equal(refused.json?.ok, false);
    assert.equal(refused.json?.refused, true);
    assert.equal(refused.json?.code, "missing-required-inputs");
    assert.equal(refused.json?.sold, false);

    const asDelivery = await satisfy(outDir, "vendor-budget-impact", { evidenceClass: "local-runtime" });
    assert.equal(asDelivery.ok, false);
    assert.equal(asDelivery.satisfied, false);
    assert.ok(["missing-receipt", "partial-artifact-set"].includes(asDelivery.code) || asDelivery.reason === "partial-artifact-set" || asDelivery.reason === "incomplete-package");
  });
});
