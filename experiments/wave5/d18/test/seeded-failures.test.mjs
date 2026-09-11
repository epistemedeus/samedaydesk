import assert from "node:assert/strict";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CATALOG, readReceipt, runVendorBudget, satisfy, tempDir, writeJson } from "./helpers.mjs";

describe("seeded foreign/partial sets cannot satisfy", { timeout: 180_000 }, () => {
  it("missing catalog output is a partial set and cannot satisfy the job", async () => {
    const outDir = tempDir("w5-d18-seed-partial-");
    const launched = runVendorBudget(outDir);
    assert.equal(launched.status, 0, launched.stderr + launched.stdout);
    rmSync(join(outDir, "budget-impact.md"));
    const result = await satisfy(outDir, "vendor-budget-impact", { evidenceClass: "fixture" });
    assert.equal(result.ok, false);
    assert.equal(result.satisfied, false);
    assert.equal(result.code, "missing-output");
    assert.equal(result.reason, "partial-artifact-set");
  });

  it("empty output objects cannot count complete for vendor-budget-impact", async () => {
    const outDir = tempDir("w5-d18-seed-empty-");
    writeJson(join(outDir, "receipt.json"), {
      schema: "samedaydesk.paid-useful-jobs.receipt.v1",
      jobId: "vendor-budget-impact",
      sold: false,
      purchaseAuthority: false,
      outputs: [{}],
    });
    const result = await satisfy(outDir, "vendor-budget-impact", {
      catalogPath: CATALOG,
      evidenceClass: "fixture",
    });
    assert.equal(result.ok, false);
    assert.equal(result.satisfied, false);
    assert.equal(result.code, "catalog-output-unlisted");
    assert.equal(result.reason, "partial-artifact-set");
  });

  it("relabeling a vendor-budget package as feed-agenda cannot satisfy feed-agenda", async () => {
    const src = tempDir("w5-d18-seed-src-");
    const launched = runVendorBudget(src);
    assert.equal(launched.status, 0, launched.stderr + launched.stdout);
    const dest = join(tempDir("w5-d18-seed-relabel-"), "pkg");
    cpSync(src, dest, { recursive: true });
    const receipt = readReceipt(dest);
    receipt.jobId = "feed-agenda";
    writeFileSync(join(dest, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    const result = await satisfy(dest, "feed-agenda", { evidenceClass: "fixture" });
    assert.equal(result.ok, false);
    assert.equal(result.satisfied, false);
    assert.equal(result.code, "catalog-output-unlisted");
  });

  it("mutating output bytes after the receipt is written cannot satisfy the job", async () => {
    const outDir = tempDir("w5-d18-seed-mutate-");
    const launched = runVendorBudget(outDir);
    assert.equal(launched.status, 0, launched.stderr + launched.stdout);
    writeFileSync(join(outDir, "budget-impact.json"), "{ \"foreign\": true }\n");
    const result = await satisfy(outDir, "vendor-budget-impact", { evidenceClass: "fixture" });
    assert.equal(result.ok, false);
    assert.equal(result.satisfied, false);
    assert.equal(result.code, "output-digest-mismatch");
  });

  it("satisfyJob without D03 verifyComplete is missing-d03, never a skipped pass", async () => {
    const { satisfyJob } = await import("../lib/satisfy.mjs");
    assert.throws(
      () =>
        satisfyJob({
          root: tempDir("w5-d18-seed-nod03-"),
          expectedJobId: "vendor-budget-impact",
        }),
      (err) => {
        assert.equal(err.code, "missing-d03");
        return true;
      },
    );
  });

  it("truncated receipt cannot satisfy", async () => {
    const outDir = tempDir("w5-d18-seed-trunc-");
    const launched = runVendorBudget(outDir);
    assert.equal(launched.status, 0, launched.stderr + launched.stdout);
    writeFileSync(join(outDir, "receipt.json"), "{\n  \"schema\": \"samedaydesk.paid-useful-jobs.receipt.v1\",\n");
    const result = await satisfy(outDir, "vendor-budget-impact", { evidenceClass: "fixture" });
    assert.equal(result.ok, false);
    assert.equal(result.satisfied, false);
    assert.equal(result.code, "truncated-receipt");
  });
});
