import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { hashTermsVersion, isIntegerTermsVersion, isTermsVersionHash } from "../lib/hash.mjs";
import { I01_GOLDEN_TERMS_VERSION } from "../lib/pins.mjs";
import { runBind } from "./helpers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenPath = path.join(here, "../fixtures/i01/complete.terms.json");

test("I01 golden termsVersion is sha256:+64hex and hasher matches Neo PR54 pin", () => {
  const terms = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
  assert.equal(terms.termsVersion, I01_GOLDEN_TERMS_VERSION);
  assert.equal(isTermsVersionHash(terms.termsVersion), true);
  assert.equal(hashTermsVersion(terms), I01_GOLDEN_TERMS_VERSION);
  assert.equal(isIntegerTermsVersion(1), true);
  assert.equal(isIntegerTermsVersion("1"), true);
  assert.equal(isIntegerTermsVersion(terms.termsVersion), false);
});

test("forged integer termsVersion ticket refuses (original F01 key is not a claim)", () => {
  const r = runBind(
    ["--ticket", path.join(here, "../fixtures/integer-terms-version.json")],
    { expectStatus: 2 },
  );
  assert.equal(r.json.ok, false);
  assert.equal(r.json.refused, true);
  assert.equal(r.json.code, "integer-terms-version");
  assert.equal(r.json.settling, false);
});
