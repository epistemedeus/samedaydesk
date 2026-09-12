import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listen } from "../lib/http.mjs";
import { TESTED_SDS_SHA } from "../lib/pins.mjs";

describe("local HTTP experiment", { timeout: 180_000 }, () => {
  it("POST /experiment returns the same certified owner-qa offer as the CLI", async () => {
    const held = await listen(0);
    try {
      const health = await fetch(`${held.url}/health`);
      assert.equal(health.status, 200);
      const healthBody = await health.json();
      assert.equal(healthBody.ok, true);
      assert.equal(healthBody.testedSha, TESTED_SDS_SHA);
      assert.equal(healthBody.liveSettleAttempted, false);
      assert.equal(healthBody.historicalAssumedScenario, true);
      assert.equal(healthBody.liveLockfileOffer, false);

      const res = await fetch(`${held.url}/experiment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          buyerClass: "owner-qa",
          confirmJob: false,
        }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.certified, true);
      assert.equal(body.historicalAssumedScenario, true);
      assert.equal(body.liveLockfileOffer, false);
      assert.equal(body.nonLossmaking, true);
      assert.equal(body.sold, false);
      assert.equal(body.offer.proposedPriceUsdc, "0.003000");
      assert.equal(body.offer.publishedToLiveCatalog, false);
      assert.equal(body.confirm, null);
    } finally {
      await new Promise((resolve) => held.server.close(resolve));
    }
  });

  it("POST /experiment with SAMPLE is 422, not a certified offer", async () => {
    const held = await listen(0);
    try {
      const res = await fetch(`${held.url}/experiment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          buyerClass: "owner-qa",
          example: true,
          confirmJob: false,
        }),
      });
      assert.equal(res.status, 422);
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.equal(body.certified, false);
      assert.equal(body.code, "sample-is-not-cost-basis");
    } finally {
      await new Promise((resolve) => held.server.close(resolve));
    }
  });
});
