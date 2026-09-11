import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareTerms } from "../lib/terms.mjs";
import { readJson } from "./helpers.mjs";

describe("unlike terms documents", () => {
  it("disclosure and kernel hashes stay unequal even when bodies match", () => {
    const compared = compareTerms(readJson("reject/disclosure-terms.json"), readJson("reject/kernel-terms.json"));
    assert.equal(compared.ok, true);
    assert.equal(compared.comparable, false);
    assert.equal(compared.equal, false);
    assert.notEqual(compared.left.sha256, compared.right.sha256);
  });

  it("forceEqual on unlike schemas is refused", () => {
    const compared = compareTerms(readJson("reject/disclosure-terms.json"), readJson("reject/kernel-terms.json"), {
      forceEqual: true,
    });
    assert.equal(compared.ok, false);
    assert.equal(compared.code, "unlike_terms_forced_equal");
  });

  it("the same disclosure document hashes equal to itself", () => {
    const doc = readJson("reject/disclosure-terms.json");
    const compared = compareTerms(doc, doc);
    assert.equal(compared.ok, true);
    assert.equal(compared.equal, true);
  });
});
