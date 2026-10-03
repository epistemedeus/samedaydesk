import assert from "node:assert/strict";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CATALOG, f08Root, startMutator, tempDir } from "./helpers.mjs";
import { launchPaidWrapper } from "../lib/launch.mjs";
import { verifyComplete } from "../lib/verify.mjs";

function completePackage() {
  const wrapperRoot = f08Root();
  const outDir = tempDir("joa-seed-");
  const launched = launchPaidWrapper({ f08Root: wrapperRoot, outDir });
  assert.equal(launched.status, 0, launched.stderr + launched.stdout);
  return outDir;
}

describe("seeded consumer failures", { timeout: 180_000 }, () => {
  it("missing last output file cannot pass verify-complete", () => {
    const outDir = completePackage();
    rmSync(join(outDir, "budget-impact.md"));
    const result = verifyComplete({ root: outDir, catalogPath: CATALOG, evidenceClass: "fixture" });
    assert.equal(result.ok, false);
    assert.equal(result.classification, "partial");
    assert.equal(result.code, "missing-output");
  });

  it("truncated receipt cannot pass verify-complete", () => {
    const outDir = completePackage();
    writeFileSync(join(outDir, "receipt.json"), "{\n  \"schema\": \"samedaydesk.paid-useful-jobs.receipt.v1\",\n");
    const result = verifyComplete({ root: outDir, catalogPath: CATALOG, evidenceClass: "fixture" });
    assert.equal(result.ok, false);
    assert.equal(result.classification, "partial");
    assert.equal(result.code, "truncated-receipt");
  });

  it("receipt path that escapes the selected root is rejected", () => {
    const outDir = completePackage();
    const receipt = JSON.parse(readFileSync(join(outDir, "receipt.json"), "utf8"));
    receipt.outputs[0].path = "../outside-secret.json";
    writeFileSync(join(outDir, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    const result = verifyComplete({ root: outDir, catalogPath: CATALOG, evidenceClass: "fixture" });
    assert.equal(result.ok, false);
    assert.equal(result.classification, "unknown");
    assert.equal(result.code, "receipt-path-escapes-root");
  });

  it("digest changes after initial read cannot pass verify-complete", async () => {
    const outDir = completePackage();
    const target = join(outDir, "budget-impact.json");
    const mutator = startMutator(target);
    await new Promise((r) => setTimeout(r, 50));
    try {
      const result = verifyComplete({
        root: outDir,
        catalogPath: CATALOG,
        evidenceClass: "local-runtime",
      });
      assert.equal(result.ok, false, JSON.stringify(result));
      assert.equal(result.code, "digest-changed-after-read");
      assert.equal(result.classification, "unknown");
    } finally {
      mutator.stop();
    }
  });

  it("integer termsVersion is not a public claim key", () => {
    const outDir = completePackage();
    const receipt = JSON.parse(readFileSync(join(outDir, "receipt.json"), "utf8"));
    receipt.termsVersion = 3;
    writeFileSync(join(outDir, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    const result = verifyComplete({ root: outDir, catalogPath: CATALOG, evidenceClass: "fixture" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "integer-terms-version-not-a-claim-key");
  });

  it("copying a complete package then deleting it from the old root still verifies at the new root", () => {
    const outDir = completePackage();
    const dest = join(tempDir("joa-copy-"), "pkg");
    cpSync(outDir, dest, { recursive: true });
    rmSync(outDir, { recursive: true, force: true });
    const result = verifyComplete({ root: dest, catalogPath: CATALOG, evidenceClass: "local-runtime" });
    assert.equal(result.ok, true, JSON.stringify(result));
  });
});
