import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PACK_ROOT, listJsonFiles, loadJson, REJECT_FIXTURES, VALID_FIXTURES } from "../src/lib.mjs";
import { REFUSED_FLAGS } from "../src/constants.mjs";

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

test("pack stays inside write boundary and has no secrets", () => {
  const files = walk(PACK_ROOT).filter((filePath) => !filePath.endsWith("hygiene.test.mjs"));
  assert.ok(files.length > 0);
  const needles = ["sk" + "_live", "sk" + "_test", "whsec" + "_", "SUPABASE_SERVICE_ROLE", "BEGIN RSA", "xai" + "-", "ghp" + "_"];
  for (const filePath of files) {
    const text = readFileSync(filePath, "utf8");
    for (const needle of needles) {
      assert.equal(text.includes(needle), false, `${filePath} contains ${needle}`);
    }
    assert.match(filePath, /w1003-receipt-forge/);
  }
});

test("valid fixtures never charge, pay, or carry settlement/payment headers", () => {
  for (const filePath of listJsonFiles(VALID_FIXTURES)) {
    const claim = loadJson(filePath);
    assert.equal(claim.charged, false);
    assert.equal(claim.paymentSent, false);
    assert.equal(claim.statusClass, "unpaid");
    assert.equal(Object.hasOwn(claim, "settlement"), false);
    const headers = claim.request?.headers ?? {};
    for (const name of Object.keys(headers)) {
      assert.equal(/^(PAYMENT-SIGNATURE|X-PAYMENT|PAYMENT-RESPONSE)$/i.test(name), false, name);
    }
  }
});

test("reject fixtures stay unpaid even when forged", () => {
  for (const filePath of listJsonFiles(REJECT_FIXTURES)) {
    const claim = loadJson(filePath);
    assert.equal(claim.charged, false);
    assert.equal(claim.paymentSent, false);
    assert.equal(claim.statusClass, "unpaid");
  }
});

test("refused flags cover live pay publish neo checkout", () => {
  for (const flag of ["live", "pay", "publish", "neo", "checkout", "payment", "settle"]) {
    assert.ok(REFUSED_FLAGS.includes(flag), flag);
  }
});
