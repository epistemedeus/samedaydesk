import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { PACK_ROOT, REPO_ROOT, parseReceipt, runDesk } from "./helpers.mjs";

const PIN = JSON.parse(readFileSync(join(PACK_ROOT, "PIN.json"), "utf8"));

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

test("pin matches committed public 1.4.7 archive", () => {
  const archive = join(REPO_ROOT, PIN.engine.archivePath);
  assert.equal(existsSync(archive), true);
  const buf = readFileSync(archive);
  assert.equal(buf.length, PIN.engine.bytes);
  assert.equal(sha256(buf), PIN.engine.sha256);
  const r = runDesk(["pin"]);
  assert.equal(r.status, 0, r.stderr);
  const body = parseReceipt(r);
  assert.equal(body.engine.version, "1.4.7");
  assert.equal(body.engine.sha256, PIN.engine.sha256);
  assert.equal(body.purchaseAuthority, false);
  assert.equal(body.repeatDemand, false);
});

test("desk runs owned callers on the real 1.4.7 engine", () => {
  const r = runDesk(["desk", "--out-dir", join(PACK_ROOT, "out", "test-desk")]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = parseReceipt(r);
  assert.equal(body.ok, true);
  assert.equal(body.delivered, true);
  assert.equal(body.code, "desk-delivered");
  assert.equal(body.callerOwned, true);
  assert.equal(body.callerFilesUnchanged, true);
  assert.equal(body.engine.cliInvoked, true);
  assert.equal(body.engine.enginesModified, false);
  assert.equal(body.repeatDemand, false);
  assert.equal(body.organicDemand, false);
  assert.equal(body.h32PrivatePrimitivesReopened, false);
  assert.equal(body.families.length, 2);
  for (const family of body.families) {
    assert.equal(family.delivered, true);
    assert.equal(family.changedInput, true);
    assert.equal(family.distinctDigest, true);
    assert.equal(family.first.cliInvoked, true);
    assert.equal(family.first.delivered, true);
    assert.equal(family.second.delivered, true);
    assert.notEqual(family.first.digest, family.second.digest);
    for (const name of family.first.promisedOutputs) {
      assert.equal(existsSync(join(family.first.outDir, name)), true, name);
    }
  }
  const lockBefore = readFileSync(join(PACK_ROOT, "callers/lockfile/before.json"));
  const vendorAfter = readFileSync(join(PACK_ROOT, "callers/vendor/after.json"));
  const lockRec = body.callerFiles.find((f) => f.path.endsWith("callers/lockfile/before.json"));
  const vendorRec = body.callerFiles.find((f) => f.path.endsWith("callers/vendor/after.json"));
  assert.equal(lockRec.sha256, sha256(lockBefore));
  assert.equal(vendorRec.sha256, sha256(vendorAfter));
});

test("--example is refused as not an owned caller file", () => {
  const r = runDesk([
    "run",
    "--job",
    "vendor-budget-impact",
    "--example",
    "--before",
    join(PACK_ROOT, "callers/vendor/before.json"),
    "--after",
    join(PACK_ROOT, "callers/vendor/after.json"),
  ]);
  assert.equal(r.status, 2);
  const body = parseReceipt(r);
  assert.equal(body.ok, false);
  assert.equal(body.refused, true);
  assert.equal(body.delivered, false);
  assert.equal(body.code, "example-not-caller-file");
});
