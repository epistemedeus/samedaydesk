import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { hashTermsVersion, integerTermsVersionRejected, isTermsVersionHash } from "../lib/terms.mjs";
import { I01_GOLDEN_TERMS_VERSION } from "../lib/pins.mjs";
import { runBatch } from "../lib/ledger.mjs";
import { OWNED, journeyRequest } from "./helpers.mjs";

describe("I01 content-hash termsVersion", () => {
  it("reproduces Neo PR54 golden fixture hash", () => {
    const golden = JSON.parse(
      readFileSync(join(OWNED, "vendor/funded-task-terms/fixtures/golden/complete.terms.json"), "utf8"),
    );
    assert.equal(golden.termsVersion, I01_GOLDEN_TERMS_VERSION);
    assert.equal(hashTermsVersion(golden), I01_GOLDEN_TERMS_VERSION);
    assert.equal(isTermsVersionHash(golden.termsVersion), true);
  });

  it("rejects integer termsVersion as invalid_input and does not mark sold", async () => {
    assert.equal(integerTermsVersionRejected(1), true);
    const ledger = await runBatch({
      termsVersion: 1,
      items: journeyRequest().items,
    });
    assert.equal(ledger.sold, false);
    assert.equal(ledger.status, "rejected");
    assert.equal(ledger.code, "invalid_input");
    assert.equal(ledger.items.length, 0);
  });
});
