import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runBatch } from "../lib/ledger.mjs";
import { loadF08Module, resolveF08Root } from "../lib/adapters.mjs";
import {
  LIVE_EXTRACT_PRICE_USDC,
  LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
} from "../lib/pins.mjs";
import { callerBudget, journeyRequest, liveSettlePayload, loadReservedPayment, sampleBudget } from "./helpers.mjs";

describe("seeded fail-closed cases", { timeout: 120_000 }, () => {
  it("runner override cannot dispatch and cannot look like a sale", async () => {
    const ledger = await runBatch(
      { items: [{ id: "override", engineId: "vendor-budget-impact", files: callerBudget() }] },
      { f08Root: "/tmp" },
    );
    assert.equal(ledger.ok, false);
    assert.equal(ledger.sold, false);
    assert.equal(ledger.code, "runner-override-refused");
    assert.equal(ledger.items.length, 0);
    assert.equal(ledger.jobRevenueUsdc, null);
  });

  it("SAMPLE item as sale is rejected; sibling stays unsold fixture", async () => {
    const files = callerBudget();
    const ledger = await runBatch({
      items: [
        {
          id: "sample-sale",
          engineId: "vendor-budget-impact",
          files: sampleBudget(),
          funding: "reserved-fixture",
          payment: loadReservedPayment(),
        },
        {
          id: "ok-sibling",
          engineId: "vendor-budget-impact",
          files,
          funding: "reserved-fixture",
          payment: loadReservedPayment(),
        },
      ],
    });
    assert.equal(ledger.sold, false);
    assert.equal(ledger.status, "partial");
    const sample = ledger.items.find((i) => i.id === "sample-sale");
    const ok = ledger.items.find((i) => i.id === "ok-sibling");
    assert.equal(sample.outcome, "rejected");
    assert.equal(sample.fundingState, "rejected");
    assert.equal(sample.code, "sample-not-a-sale");
    assert.equal(sample.sold, false);
    assert.equal(sample.sample, true);
    assert.equal(ok.outcome, "completed");
    assert.equal(ok.sold, false);
    assert.equal(ok.fundingState, "reserved-fixture");
  });

  it("example flag plus reserved-fixture is not a sale", async () => {
    const ledger = await runBatch({
      items: [
        {
          id: "example-sale",
          engineId: "vendor-budget-impact",
          example: true,
          funding: "reserved-fixture",
          payment: loadReservedPayment(),
        },
      ],
    });
    assert.equal(ledger.status, "rejected");
    assert.equal(ledger.sold, false);
    assert.equal(ledger.items[0].code, "sample-not-a-sale");
    assert.equal(ledger.items[0].sold, false);
  });

  it("live-settle payment payload is refused; sold stays false", async () => {
    const payment = liveSettlePayload();
    const pin = await loadF08Module(resolveF08Root());
    assert.equal(pin.wouldSettleIfGuardOmitted(payment, payment.accepted), true);
    const files = callerBudget();

    const omitted = await runBatch({
      items: [
        {
          id: "looks-settleable",
          engineId: "vendor-budget-impact",
          files,
          payment,
        },
      ],
    });
    assert.equal(omitted.sold, false);
    assert.equal(omitted.items[0].sold, false);
    assert.equal(omitted.items[0].fundingState, "rejected");
    assert.equal(omitted.items[0].code, "fixture-cannot-live-settle");
    assert.equal(omitted.items[0].liveSettleAllowed, false);

    const settle = await runBatch({
      items: [
        {
          id: "settle-flag",
          engineId: "vendor-budget-impact",
          files,
          funding: "reserved-fixture",
          payment: loadReservedPayment(),
          settle: true,
        },
      ],
    });
    assert.equal(settle.sold, false);
    assert.equal(settle.items[0].code, "live-settle-out-of-scope");
    assert.equal(settle.items[0].sold, false);
  });

  it("changing extract 0.005 or seller-integrity 0.01 is refused", async () => {
    const files = callerBudget();
    const extract = await runBatch({
      items: [
        {
          id: "extract-price",
          engineId: "vendor-budget-impact",
          files,
          funding: "reserved-fixture",
          payment: loadReservedPayment(),
          price: LIVE_EXTRACT_PRICE_USDC,
        },
      ],
    });
    assert.equal(extract.sold, false);
    assert.equal(extract.items[0].code, "live-price-mutation-refused");
    assert.equal(extract.items[0].sold, false);

    const sia = await runBatch({
      items: [
        {
          id: "sia-price",
          engineId: "vendor-budget-impact",
          files,
          funding: "reserved-fixture",
          payment: loadReservedPayment(),
          price: LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
        },
      ],
    });
    assert.equal(sia.sold, false);
    assert.equal(sia.items[0].code, "live-price-mutation-refused");

    const publish = await runBatch({
      publishToLiveCatalog: true,
      items: journeyRequest().items,
    });
    assert.equal(publish.sold, false);
    assert.equal(publish.code, "live-price-mutation-refused");
    assert.equal(publish.liveCatalogWritten, false);
  });
});
