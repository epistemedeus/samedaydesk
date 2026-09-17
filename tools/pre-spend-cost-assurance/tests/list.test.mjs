import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { JOURNEY_CAP, JOURNEY_CAP_ATOMIC } from "../src/pins.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin/pre-spend.mjs");

function run(args) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd: ROOT,
  });
}

describe("list tools/caps without purchasing", () => {
  test("CLI list exits 0 with extract + integrity-audit cap 0.015 and purchaseAuthorized false", () => {
    const r = run(["list"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const json = JSON.parse(r.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.status, "list");
    assert.equal(json.purchaseAuthorized, false);
    assert.equal(json.costCap, JOURNEY_CAP);
    assert.equal(json.capAtomic, JOURNEY_CAP_ATOMIC);
    assert.equal(json.currency, "USDC");
    assert.equal(json.network, "eip155:8453");
    assert.equal(json.settleCalled, false);
    assert.equal(json.prepareCalled, false);
    const ids = json.lines.map((line) => line.id);
    assert.deepEqual(ids, ["extract", "seller-integrity-audit"]);
    assert.equal(json.lines[0].amount, "0.005");
    assert.equal(json.lines[0].paid, false);
    assert.equal(json.lines[0].httpStatus, 402);
    assert.equal(json.lines[1].amount, "0.01");
    assert.equal(json.required.accounts.some((a) => a.id === "base-usdc-wallet"), true);
    assert.equal(json.honesty.purchaseAuthorized, false);
    assert.equal(json.honesty.liveSdsPricesUnchanged, true);
  });
});
