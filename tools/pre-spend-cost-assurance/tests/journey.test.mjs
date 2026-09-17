import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { JOURNEY_CAP } from "../src/pins.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin/pre-spend.mjs");

function run(args) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd: ROOT,
  });
}

describe("literal user journey", () => {
  test("extract + integrity-audit unpaid amounts → cap 0.015 → purchaseAuthorized false → POST payment rejected", () => {
    const r = run(["journey", "--fixture", "fixtures/ok.json"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const json = JSON.parse(r.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.costCap, JOURNEY_CAP);
    assert.equal(json.costCap, "0.015");
    assert.equal(json.currency, "USDC");
    assert.equal(json.purchaseAuthorized, false);
    assert.equal(json.capAtomic, "15000");
    assert.equal(json.settleCalled, false);
    assert.equal(json.prepareCalled, false);
    const ids = json.lines.map((line) => line.id);
    assert.deepEqual(ids, ["extract", "seller-integrity-audit"]);
    assert.equal(json.required.tools.length >= 2, true);
    assert.equal(json.postPayment.ok, false);
    assert.equal(json.postPayment.code, "post_payment");
    assert.equal(json.postPayment.purchaseAuthorized, false);
  });
});
