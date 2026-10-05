import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPaidBatchServer, listenLocal } from "../lib/http.mjs";
import { journeyRequest, REPO_ROOT } from "./helpers.mjs";
import { FIXTURE_PRICE_USDC } from "../lib/pins.mjs";

describe("local HTTP runtime", { timeout: 120_000 }, () => {
  it("POST /batch on 127.0.0.1 returns the partial fixture ledger", async () => {
    const { server } = createPaidBatchServer({ baseDir: REPO_ROOT });
    const info = await listenLocal(server, { host: "127.0.0.1", port: 0 });
    try {
      const health = await fetch(`${info.url}/health`);
      const healthBody = await health.json();
      assert.equal(health.ok, true);
      assert.equal(healthBody.sold, false);
      assert.equal(healthBody.liveSettlement, "out-of-scope");

      const res = await fetch(`${info.url}/batch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(journeyRequest()),
      });
      assert.equal(res.status, 200);
      const ledger = await res.json();
      assert.equal(ledger.status, "partial");
      assert.equal(ledger.sold, false);
      assert.equal(ledger.counts.completed, 1);
      assert.equal(ledger.counts.rejected, 1);
      assert.ok(ledger.items.every((item) => item.price.amountUsdc === FIXTURE_PRICE_USDC));

      const get = await fetch(`${info.url}/batch/${ledger.batchId}`);
      const stored = await get.json();
      assert.equal(stored.batchId, ledger.batchId);
      assert.equal(stored.sold, false);
    } finally {
      server.close();
    }
  });
});
