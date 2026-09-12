import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { parseJson, SDS52_CALLER, spawnD28, AFTER_NOCHANGE, AFTER_NOTE } from "./helpers.mjs";

function packOwnerQa() {
  const packetDir = mkdtempSync(join(tmpdir(), "d28-ret-"));
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
  return { packetDir, packed: parseJson(packed.stdout) };
}

describe("return-job measurement", { timeout: 180_000 }, () => {
  it("changed after bytes yield an owner-QA useful second job and informational domain", () => {
    const { packetDir, packed } = packOwnerQa();
    assert.equal(packed.packet.firstJob.analysisStatus, "actionable");
    const measured = spawnD28([
      "measure-return",
      "--packet",
      packetDir,
      "--before",
      SDS52_CALLER.before,
      "--after",
      AFTER_NOCHANGE,
    ]);
    assert.equal(measured.status, 0, measured.stderr + measured.stdout);
    const body = parseJson(measured.stdout);
    assert.equal(body.comparison.returnSignal, "useful-second-job");
    assert.equal(body.comparison.usefulSecondJob, true);
    assert.equal(body.comparison.inputChanged, true);
    assert.equal(body.comparison.domainChanged, true);
    assert.equal(body.comparison.firstAnalysis, "actionable");
    assert.equal(body.comparison.secondAnalysis, "informational");
    assert.equal(body.field.liveReturn, "absent");
    assert.equal(body.returnJob.sold, false);
    assert.equal(body.returnJob.label, "owner-qa");
    assert.notEqual(body.returnJob.outDir, packed.packet.firstJob.outDir);
  });

  it("same first-job after file is same-input-repeat even if output bytes differ", () => {
    const { packetDir } = packOwnerQa();
    const measured = spawnD28([
      "measure-return",
      "--packet",
      packetDir,
      "--before",
      SDS52_CALLER.before,
      "--after",
      SDS52_CALLER.after,
    ]);
    assert.notEqual(measured.status, 0);
    const body = parseJson(measured.stdout);
    assert.equal(body.comparison.returnSignal, "same-input-repeat");
    assert.equal(body.comparison.usefulSecondJob, false);
    assert.equal(body.comparison.generatedAtMayDiffer, true);
  });

  it("unrelated note change does not force domain hashes equal", () => {
    const { packetDir, packed } = packOwnerQa();
    const measured = spawnD28([
      "measure-return",
      "--packet",
      packetDir,
      "--before",
      SDS52_CALLER.before,
      "--after",
      AFTER_NOTE,
    ]);
    assert.equal(measured.status, 0, measured.stderr + measured.stdout);
    const body = parseJson(measured.stdout);
    assert.equal(body.comparison.inputChanged, true);
    assert.equal(body.comparison.usefulSecondJob, true);
    assert.notEqual(body.returnJob.engineDigest, packed.packet.firstJob.engineDigest);
    if (body.comparison.domainChanged === false) {
      assert.equal(body.comparison.returnSignal, "second-job-unchanged-domain");
    } else {
      assert.equal(body.comparison.returnSignal, "useful-second-job");
    }
  });

  it("shared first/return outDir is refused", () => {
    const { packetDir, packed } = packOwnerQa();
    const measured = spawnD28([
      "measure-return",
      "--packet",
      packetDir,
      "--before",
      SDS52_CALLER.before,
      "--after",
      AFTER_NOCHANGE,
      "--return-dir",
      packed.packet.firstJob.outDir,
    ]);
    assert.equal(measured.status, 2);
    const body = parseJson(measured.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, "shared-outdir-refused");
  });
});
