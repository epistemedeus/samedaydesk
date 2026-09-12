import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runWrapperJob } from "../lib/wrapper-cli.mjs";
import { D01_CONTRACT } from "../lib/pins.mjs";
import { SDS52_CALLER } from "./helpers.mjs";

describe("current-source execution.v1 findings", { timeout: 180_000 }, () => {
  it("same inspected bytes keep inputsDigest; contract fields are present", async () => {
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
    assert.equal(typeof a.engine.digest, "string");
    assert.equal(typeof b.engine.digest, "string");
    // engine.digest / outputsDigest can move with generatedAt. Inspected-byte identity is inputsDigest.
    assert.equal(a.contract, D01_CONTRACT);
    assert.equal(a.transport, "ok");
    assert.equal(typeof a.analysis, "object");
    assert.equal(a.delivery.complete, true);
    assert.equal(a.classified.contract, D01_CONTRACT);
    assert.match(a.receipt.inputsDigest, /^[0-9a-f]{64}$/);
  });
});
