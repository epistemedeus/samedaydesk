import assert from "node:assert/strict";
import test from "node:test";
import { readPackFile, walkPack } from "./helpers.mjs";

test("pack contains no secrets, publish, payment mutation, or neo host", () => {
  const files = walkPack();
  assert.ok(files.length > 0);
  for (const file of files) {
    if (file.endsWith("secret-scan.test.mjs") || file.endsWith("seeded-failures.test.mjs")) {
      continue;
    }
    const text = readPackFile(file);
    assert.equal(/neomorphic-io/i.test(text), false, `neo host mention in ${file}`);
    assert.equal(/sk_live_|sk_test_|whsec_/i.test(text), false, `stripe secret in ${file}`);
    assert.equal(/\bnpm publish\b/.test(text), false, `publish command in ${file}`);
    assert.equal(/\bstripe\.checkout\b/i.test(text), false, `stripe checkout in ${file}`);
    assert.equal(/PAYMENT-SIGNATURE/i.test(text), false, `payment signature in ${file}`);
    const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    for (const email of emails) {
      assert.match(
        email.toLowerCase(),
        /@(example\.test|example\.com)$/,
        `non-fixture email ${email} in ${file}`,
      );
    }
  }
});
