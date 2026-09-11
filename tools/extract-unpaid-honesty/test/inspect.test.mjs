import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectRequest, isExtractUrl, scanText } from "../lib/inspect.mjs";

describe("inspect", () => {
  it("flags extract and batch, not useful-jobs public paths", () => {
    assert.equal(isExtractUrl("https://agents.samedaydesk.com/extract?url=https://example.com"), true);
    assert.equal(isExtractUrl("https://agents.samedaydesk.com/extract/batch"), true);
    assert.equal(isExtractUrl("https://samedaydesk.com/for-agents/useful-jobs"), false);
    const extract = inspectRequest({
      url: "https://agents.samedaydesk.com/extract?url=https://example.com",
      headers: { Accept: "application/json" },
    });
    assert.equal(extract.forbidden, true);
    assert.ok(extract.reasons.includes("extract-url"));
    const paid = inspectRequest({
      url: "https://example.com/",
      headers: { "PAYMENT-SIGNATURE": "x" },
    });
    assert.ok(paid.reasons.includes("payment-header"));
    const scan = scanText("GET https://agents.samedaydesk.com/extract/batch");
    assert.ok(scan.reasons.includes("extract-batch-url"));
  });
});
