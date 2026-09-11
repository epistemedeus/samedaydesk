import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runWrapperJob } from "../lib/wrapper-cli.mjs";
import { SDS52_CALLER } from "./helpers.mjs";

describe("SDS52 current-source findings", { timeout: 180_000 }, () => {
  it("same inspected bytes keep inputsDigest and engine.digest; outputsDigest may move with generatedAt", async () => {
    const a = await Promise.resolve(
      runWrapperJob({
        jobId: "vendor-budget-impact",
        inputs: { before: SDS52_CALLER.before, after: SDS52_CALLER.after },
        funding: "unfunded",
        outDir: mkdtempSync(join(tmpdir(), "d28-a-")),
      }),
    );
    const b = runWrapperJob({
      jobId: "vendor-budget-impact",
      inputs: { before: SDS52_CALLER.before, after: SDS52_CALLER.after },
      funding: "unfunded",
      outDir: mkdtempSync(join(tmpdir(), "d28-b-")),
    });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(a.receipt.inputsDigest, b.receipt.inputsDigest);
    assert.equal(a.engine.digest, b.engine.digest);
    assert.equal(a.classified.contract, null);
    assert.equal("transport" in a, false);
    assert.equal("analysis" in a, false);
    assert.equal("delivery" in a, false);
    assert.match(a.receipt.inputsDigest, /^[0-9a-f]{64}$/);
  });
});
