import assert from "node:assert/strict";
import { cpSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CATALOG, CONTAMINATION_CLI, d03, readReceipt, runVendorBudget, satisfy, tempDir } from "./helpers.mjs";
import { D01_TESTED_SHA, D03_TESTED_SHA } from "../lib/pins.mjs";

describe("caller journey: isolated complete package satisfies only its job", { timeout: 180_000 }, () => {
  it("D01 CLI produces a complete vendor-budget package that satisfies that job and not feed-agenda", async () => {
    const loaded = await d03();
    assert.equal(typeof loaded.verifyComplete, "function");
    assert.equal(loaded.testedSha, D03_TESTED_SHA);

    const outDir = tempDir("w5-d18-journey-");
    const launched = runVendorBudget(outDir);
    assert.equal(launched.status, 0, launched.stderr + launched.stdout);
    assert.equal(launched.testedSha, D01_TESTED_SHA);
    assert.equal(launched.json?.ok, true, launched.stdout);
    assert.equal(launched.json?.sold, false);
    assert.equal(existsSync(join(outDir, "budget-impact.json")), true);
    assert.equal(existsSync(join(outDir, "budget-impact.md")), true);
    assert.equal(existsSync(join(outDir, "receipt.json")), true);

    const receipt = readReceipt(outDir);
    assert.equal(receipt.jobId, "vendor-budget-impact");
    assert.equal(receipt.sold, false);
    assert.equal(receipt.purchaseAuthority, false);
    assert.match(receipt.inputsDigest, /^[0-9a-f]{64}$/);

    const own = await satisfy(outDir, "vendor-budget-impact", {
      expectedInputsDigest: receipt.inputsDigest,
      expectedOutputsDigest: receipt.outputsDigest,
      evidenceClass: "local-runtime",
    });
    assert.equal(own.ok, true, JSON.stringify(own));
    assert.equal(own.satisfied, true);
    assert.equal(own.jobId, "vendor-budget-impact");
    assert.equal(own.foreignSiblingArtifacts.length, 0);

    const asFeed = await satisfy(outDir, "feed-agenda", { evidenceClass: "local-runtime" });
    assert.equal(asFeed.ok, false);
    assert.equal(asFeed.satisfied, false);
    assert.equal(asFeed.code, "foreign-job-artifacts");

    const portable = join(tempDir("w5-d18-portable-"), "package");
    cpSync(outDir, portable, { recursive: true });
    const cli = spawnSync(
      process.execPath,
      [CONTAMINATION_CLI, "satisfy", "--root", portable, "--job", "vendor-budget-impact", "--catalog", CATALOG],
      { encoding: "utf8" },
    );
    assert.equal(cli.status, 0, cli.stderr + cli.stdout);
    const body = JSON.parse(cli.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.satisfied, true);
    assert.equal(body.jobId, "vendor-budget-impact");

    const wrongCli = spawnSync(
      process.execPath,
      [CONTAMINATION_CLI, "satisfy", "--root", portable, "--job", "feed-agenda", "--catalog", CATALOG],
      { encoding: "utf8" },
    );
    assert.equal(wrongCli.status, 2);
    const wrongBody = JSON.parse(wrongCli.stdout);
    assert.equal(wrongBody.code, "foreign-job-artifacts");
  });
});
