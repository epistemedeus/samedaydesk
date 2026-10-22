import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { assurePlanFile } from "../src/assure.mjs";
import { JOURNEY_CAP } from "../src/pins.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin/pre-spend.mjs");

function run(args) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd: ROOT,
  });
}

describe("assure", () => {
  test("assure --plan lists tools and decimal-string cap without purchase", async () => {
    const result = await assurePlanFile(path.join(ROOT, "fixtures/ok-plan.json"));
    assert.equal(result.ok, true);
    assert.equal(result.costCap, JOURNEY_CAP);
    assert.equal(result.purchaseAuthorized, false);
    assert.equal(result.required.tools.map((t) => t.id).includes("extract"), true);
    assert.equal(result.required.accounts.some((a) => a.id === "base-usdc-wallet"), true);
    assert.equal(result.settleCalled, false);
    assert.equal(result.prepareCalled, false);
  });

  test("CLI assure --plan exits 0", () => {
    const r = run(["assure", "--plan", "fixtures/ok-plan.json"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const json = JSON.parse(r.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.costCap, "0.015");
    assert.equal(json.purchaseAuthorized, false);
  });

  test("missing --plan exits 2", () => {
    const r = run(["assure"]);
    assert.equal(r.status, 2);
    const json = JSON.parse(r.stdout);
    assert.equal(json.code, "missing_required_inputs");
    assert.equal(json.purchaseAuthorized, false);
  });

  test("settle is refused and does not call settle", () => {
    const r = run(["settle"]);
    assert.equal(r.status, 2);
    const json = JSON.parse(r.stdout);
    assert.equal(json.code, "settle_refused");
    assert.equal(json.settleCalled, false);
    assert.equal(json.purchaseAuthorized, false);
  });

  test("prepare is refused", () => {
    const r = run(["prepare"]);
    assert.equal(r.status, 2);
    const json = JSON.parse(r.stdout);
    assert.equal(json.code, "prepare_refused");
    assert.equal(json.prepareCalled, false);
  });
});
