import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { inspectSample } from "../../../../server/paid-useful-jobs/lib/sample-guard.mjs";
import { runWrapperJob } from "../lib/wrapper-cli.mjs";
import { CRASH_CLI, parseJson, SDS52_CALLER, spawnD28 } from "./helpers.mjs";

describe("refusals vs crashes vs valid no-change", { timeout: 180_000 }, () => {
  it("missing after is wrapper refusal, not engine crash", () => {
    const outDir = mkdtempSync(join(tmpdir(), "d28-miss-"));
    const result = runWrapperJob({
      jobId: "vendor-budget-impact",
      inputs: { before: SDS52_CALLER.before },
      funding: "unfunded",
      outDir,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "missing-required-inputs");
    assert.equal(result.classified.transport, "rejected");
    assert.equal(result.classified.crashLike, false);
    assert.equal(result.classified.usefulDelivery, false);
    assert.equal(result.sold, false);
  });

  it("SAMPLE reserved-fixture is not a release sale", () => {
    const r = runWrapperJob({
      jobId: "vendor-budget-impact",
      example: true,
      funding: "reserved-fixture",
      payment: SDS52_CALLER.payment,
      outDir: mkdtempSync(join(tmpdir(), "d28-exout-")),
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "sample-not-a-sale");
    assert.equal(r.classified.transport, "rejected");
    assert.equal(r.sample, true);
    assert.equal(r.sold, false);
    assert.equal(r.classified.usefulDelivery, false);
  });

  it("identical before/after is a valid informational report, not a crash", () => {
    const packetDir = mkdtempSync(join(tmpdir(), "d28-nc-"));
    const packed = spawnD28([
      "pack",
      "--out-dir",
      packetDir,
      "--before",
      SDS52_CALLER.before,
      "--after",
      SDS52_CALLER.before,
      "--funding",
      "unfunded",
    ]);
    assert.equal(packed.status, 0, packed.stderr + packed.stdout);
    const body = parseJson(packed.stdout);
    assert.equal(body.packet.firstJob.analysisStatus, "informational");
    assert.equal(body.packet.firstJob.validNoChange, true);
    assert.equal(body.packet.firstJob.usefulDelivery, true);
    assert.equal(body.packet.firstJob.classified.crashLike, false);
    assert.equal(body.packet.settlement.sold, false);
  });

  it("non-JSON wrapper exit is transport failure, not useful delivery", () => {
    const result = runWrapperJob({
      jobId: "vendor-budget-impact",
      inputs: { before: SDS52_CALLER.before, after: SDS52_CALLER.after },
      outDir: mkdtempSync(join(tmpdir(), "d28-crash-")),
      cli: CRASH_CLI,
    });
    assert.equal(result.ok, false);
    assert.equal(result.classified.transport, "engine-crash");
    assert.equal(result.classified.crashLike, true);
    assert.equal(result.classified.usefulDelivery, false);
    assert.notEqual(result.classified.analysis.outcome, "informational");
  });

  it("execution.v1 inspectSample detects inline JSON SAMPLE strings", () => {
    const asString = inspectSample({
      inputs: { input: JSON.stringify({ label: "SAMPLE", sampleLabel: "SAMPLE" }) },
    });
    const asObject = inspectSample({
      inputs: { input: { label: "SAMPLE", sampleLabel: "SAMPLE" } },
    });
    assert.equal(asString.sample, true);
    assert.ok(asString.reasons.some((r) => r.startsWith("json-sample-label:")));
    assert.equal(asObject.sample, true);
    assert.ok(asObject.reasons.includes("json-sample-label:input"));
  });
});
