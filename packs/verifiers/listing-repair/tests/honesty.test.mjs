import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { FORBIDDEN_COMPLETION_LABEL } from "../src/constants.mjs";
import { verifyListingRepair } from "../src/verify.mjs";

const pack = dirname(fileURLToPath(new URL(".", import.meta.url)));

function load(rel) {
  return JSON.parse(readFileSync(join(pack, rel), "utf8"));
}

test("evidence ≠ suggestion ≠ publish; never actual_completion", () => {
  const packet = load("fixtures/ok/ok.packet.json");
  const source = load("fixtures/ok/ok-source.json");
  const v = verifyListingRepair({ packet, source, flags: {} });
  assert.equal(v.checks.publish, false);
  assert.equal(v.honesty.lanes.publish, false);
  assert.equal(v.honesty.lanes.evidence, true);
  assert.equal(v.honesty.lanes.suggestion, true);
  assert.equal(v.provenance.purchaseAuthority, false);
  assert.equal(Object.hasOwn(v, FORBIDDEN_COMPLETION_LABEL), false);
  assert.notEqual(v.provenance.completionLabel, FORBIDDEN_COMPLETION_LABEL);
});

test("publish attempt keeps publish lane false", () => {
  const packet = load("fixtures/reject/publish-attempt.packet.json");
  const source = load("fixtures/ok/ok-source.json");
  const v = verifyListingRepair({ packet, source, flags: {} });
  assert.equal(v.ok, false);
  assert.equal(v.checks.publish, false);
  assert.equal(v.honesty.publishAttempted, true);
  assert.equal(v.honesty.lanes.publish, false);
});
