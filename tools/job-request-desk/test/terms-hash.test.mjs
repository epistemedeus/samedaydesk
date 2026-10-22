import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { I01_GOLDEN_TERMS_VERSION } from "../lib/pins.mjs";
import { hashTermsVersion, isTermsVersionHash } from "../lib/vendor/funded-task-terms/hash.mjs";
import { assertTermsVersionNotInteger, hashJobRequestTerms, buildTermsBody } from "../lib/terms.mjs";
import { DeskRefuse } from "../lib/refuse.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, "../fixtures/i01/complete.terms.json"), "utf8"));

describe("I01 content-hash terms contract", () => {
  it("replays Neo PR54 golden termsVersion", () => {
    const computed = hashTermsVersion(golden);
    assert.equal(computed, I01_GOLDEN_TERMS_VERSION);
    assert.equal(computed, golden.termsVersion);
    assert.equal(isTermsVersionHash(computed), true);
  });

  it("rejects integer termsVersion (original F01 dual-key)", () => {
    assert.throws(() => assertTermsVersionNotInteger(1), (err) => {
      assert.equal(err instanceof DeskRefuse, true);
      assert.equal(err.code, "invalid_input");
      return true;
    });
    assert.throws(() => assertTermsVersionNotInteger("3"), (err) => err.code === "invalid_input");
  });

  it("job-request terms are content-hashed, not integer", () => {
    const body = buildTermsBody({
      engineId: "vendor-budget-impact",
      inputs: [{ flag: "--before", sha256: "ab".repeat(32), bytes: 12 }],
      orderId: null,
      example: false,
    });
    const hashed = hashJobRequestTerms(body);
    assert.equal(isTermsVersionHash(hashed), true);
    assert.equal(typeof body.schemaVersion, "number");
    assert.equal(body.termsVersion, undefined);
  });
});
