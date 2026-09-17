import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { outputsPresent } from "../lib/engine.mjs";
import { assertReceiptContract, baseReceipt } from "../lib/receipt.mjs";
import { flagOn, hasFlag, parseArgs } from "../lib/cli.mjs";

test("outputsPresent ignores directories that share an output name", () => {
  const dir = mkdtempSync(join(tmpdir(), "ujd-out-"));
  mkdirSync(join(dir, "budget-impact.json"));
  writeFileSync(join(dir, "budget-impact.md"), "ok\n");
  assert.deepEqual(outputsPresent(dir, ["budget-impact.json", "budget-impact.md"]), [
    "budget-impact.md",
  ]);
});

test("baseReceipt pins authority flags after extra", () => {
  const receipt = baseReceipt({
    ok: true,
    refused: false,
    delivered: true,
    code: "delivered",
    purchaseAuthority: true,
    organicDemand: true,
    repeatDemand: true,
    h32PrivatePrimitivesReopened: true,
  });
  assert.equal(receipt.purchaseAuthority, false);
  assert.equal(receipt.organicDemand, false);
  assert.equal(receipt.repeatDemand, false);
  assert.equal(receipt.h32PrivatePrimitivesReopened, false);
  assertReceiptContract(receipt);
});

test("assertReceiptContract rejects schema drift", () => {
  const receipt = baseReceipt({ ok: false, refused: true, delivered: false, code: "x" });
  receipt.engine.version = "1.4.6";
  assert.throws(() => assertReceiptContract(receipt), /engine\.version/);
});

test("parseArgs + hasFlag treats --example with a value as present", () => {
  const args = parseArgs(["run", "--example", "samples/foo.json", "--before", "a.json"]);
  assert.equal(hasFlag(args, "example"), true);
  assert.equal(args.example, "samples/foo.json");
});

test("flagOn treats string false as off", () => {
  assert.equal(flagOn(true), true);
  assert.equal(flagOn("false"), false);
  assert.equal(flagOn("0"), false);
  assert.equal(flagOn(undefined), false);
  assert.equal(flagOn("yes"), true);
});
