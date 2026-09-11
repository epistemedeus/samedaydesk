import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ARCHIVE_SHA256, DEFAULT_OUTPUTS, D01_CONTRACT, RECEIPT_SCHEMA } from "../lib/pins.mjs";
import { parseJson, SDS52_CALLER, spawnD28 } from "./helpers.mjs";

describe("pack and readback", { timeout: 180_000 }, () => {
  it("CLI pack writes SDS52 artifacts and readback confirms archive identity", () => {
    const packetDir = mkdtempSync(join(tmpdir(), "d28-pack-"));
    const packed = spawnD28([
      "pack",
      "--out-dir",
      packetDir,
      "--before",
      SDS52_CALLER.before,
      "--after",
      SDS52_CALLER.after,
      "--funding",
      "reserved-fixture",
      "--payment",
      SDS52_CALLER.payment,
    ]);
    assert.equal(packed.status, 0, packed.stderr + packed.stdout);
    const body = parseJson(packed.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.packet.engineArchive.sha256, ARCHIVE_SHA256);
    assert.equal(body.packet.engineArchive.match, true);
    assert.equal(body.packet.settlement.sold, false);
    assert.equal(body.packet.deploy.deployed, false);
    assert.equal(body.packet.field.liveReturn, "absent");
    assert.equal(body.packet.firstJob.analysisStatus, "actionable");
    assert.equal(body.packet.firstJob.receiptSchema, RECEIPT_SCHEMA);
    assert.equal(body.packet.firstJob.classified.contract, D01_CONTRACT);
    for (const name of DEFAULT_OUTPUTS) {
      assert.equal(existsSync(join(packetDir, "first", name)), true);
    }
    assert.equal(existsSync(join(packetDir, "packet.json")), true);

    const rb = spawnD28(["readback", "--packet", packetDir]);
    assert.equal(rb.status, 0, rb.stderr + rb.stdout);
    const readback = parseJson(rb.stdout);
    assert.equal(readback.ok, true);
    assert.equal(readback.sds52LacksD01Contract, false);
    assert.equal(readback.d01ContractObservedOnResult, true);
    assert.ok(readback.listedJobs.includes("vendor-budget-impact"));
  });

  it("readback fails when a packed output file is removed", () => {
    const packetDir = mkdtempSync(join(tmpdir(), "d28-missing-"));
    const packed = spawnD28([
      "pack",
      "--out-dir",
      packetDir,
      "--before",
      SDS52_CALLER.before,
      "--after",
      SDS52_CALLER.after,
      "--payment",
      SDS52_CALLER.payment,
    ]);
    assert.equal(packed.status, 0, packed.stderr + packed.stdout);
    unlinkSync(join(packetDir, "first", "budget-impact.md"));
    const rb = spawnD28(["readback", "--packet", packetDir]);
    assert.equal(rb.status, 2);
    const body = parseJson(rb.stdout);
    assert.equal(body.ok, false);
    assert.ok(body.failures.includes("missing-output:budget-impact.md"));
  });

  it("unknown job is a wrapper refusal, not a packed release", () => {
    const packetDir = mkdtempSync(join(tmpdir(), "d28-unknown-"));
    const packed = spawnD28(["pack", "--out-dir", packetDir, "--job", "not-a-real-job"]);
    assert.equal(packed.status, 2, packed.stderr + packed.stdout);
    const body = parseJson(packed.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.packet.firstJob.classified.transport, "rejected");
    assert.equal(body.packet.firstJob.classified.code, "unknown-job");
    assert.equal(body.packet.firstJob.classified.crashLike, false);
    assert.equal(body.packet.firstJob.usefulDelivery, false);
    rmSync(packetDir, { recursive: true, force: true });
  });
});
