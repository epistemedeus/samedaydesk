import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { hashTermsVersion, isTermsVersionHash } from "../vendor/i01-hash-terms/hash.mjs";
import { PIN } from "../lib/pins.mjs";
import { identityDocument } from "../lib/hash-terms.mjs";

const here = dirname(fileURLToPath(import.meta.url));

describe("I01 hash terms contract", () => {
  it("vendored hasher matches Neo PR54 golden termsVersion", () => {
    const golden = JSON.parse(readFileSync(join(here, "fixtures/i01-golden-terms.json"), "utf8"));
    assert.equal(golden.termsVersion, PIN.i01HashTerms.goldenTermsVersion);
    assert.equal(hashTermsVersion(golden), golden.termsVersion);
    assert.equal(isTermsVersionHash(golden.termsVersion), true);
  });

  it("integer termsVersion is dropped; body hash is the claim key", () => {
    const golden = JSON.parse(readFileSync(join(here, "fixtures/i01-golden-terms.json"), "utf8"));
    const withInt = { ...golden, termsVersion: 1 };
    assert.equal(hashTermsVersion(withInt), golden.termsVersion);
  });

  it("output identity documents use sha256-prefixed hashes, not integer versions", () => {
    const identity = identityDocument({
      jobId: "vendor-budget-impact",
      outputs: [{ name: "budget-impact.json", bytes: 4, sha256: "ab".repeat(32) }],
      outputsDigest: "cd".repeat(32),
      engineArchiveSha256: PIN.archive.sha256,
    });
    const hashed = hashTermsVersion(identity);
    assert.match(hashed, /^sha256:[0-9a-f]{64}$/);
    const changed = hashTermsVersion({ ...identity, jobId: "other" });
    assert.notEqual(changed, hashed);
  });
});
