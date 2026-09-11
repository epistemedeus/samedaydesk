import { describe, it } from "node:test";
import { assert } from "./helpers.mjs";
import { startPublicOrigin } from "../lib/public-http.mjs";
import { discoverOffer, listPaidOffers } from "../lib/offer.mjs";
import { FIRST_OFFER } from "../lib/repo.mjs";

describe("public offer HTTP + CLI list", { timeout: 30_000 }, () => {
  it("HTTP catalog and discovery join D01 CLI list for the first offer", async () => {
    const http = await startPublicOrigin();
    try {
      const offer = await discoverOffer(http.origin, FIRST_OFFER);
      assert.equal(offer.catalog.status, 200);
      assert.equal(offer.discovery.status, 200);
      assert.equal(offer.listed.proc.status, 0);
      assert.equal(offer.advertised, true);
      assert.deepEqual(offer.catalogJobs.slice().sort(), offer.listedJobs.slice().sort());
      assert.equal(offer.listedJobs.includes(FIRST_OFFER), true);
      assert.equal(offer.purchaseAuthority, false);
      assert.equal(offer.discovery.body.paidHostedClaim, false);
      assert.deepEqual(offer.outputs, ["budget-impact.json", "budget-impact.md"]);
    } finally {
      await http.stop();
    }
  });

  it("CLI list is structured JSON and does not claim live settlement", () => {
    const listed = listPaidOffers();
    assert.equal(listed.proc.status, 0);
    assert.equal(listed.parsed.body.ok, true);
    assert.equal(listed.parsed.body.liveSettlement, "out-of-scope");
    assert.equal(listed.parsed.body.jobs.length, 6);
  });
});
