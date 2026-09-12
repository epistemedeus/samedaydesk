import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  FIXTURE_PRICE_USDC,
  LIVE_EXTRACT_PRICE_USDC,
  LIVE_PAY_TO,
  LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
  PROPOSED_PRICE_USDC,
  REPO_ROOT,
} from "../lib/pins.mjs";

describe("live catalog prices stay unchanged", () => {
  it("does not publish the proposed floor onto extract or seller-integrity-audit", () => {
    const catalog = JSON.parse(
      readFileSync(join(REPO_ROOT, "fixtures/buyer-runtimes/catalog.json"), "utf8"),
    );
    assert.equal(String(catalog.route.mcpPriceUsd), LIVE_EXTRACT_PRICE_USDC);
    assert.equal(catalog.contract.priceUsd, 0.005);
    assert.equal(catalog.contract.payTo, LIVE_PAY_TO);
    assert.notEqual(PROPOSED_PRICE_USDC, LIVE_EXTRACT_PRICE_USDC);
    assert.notEqual(PROPOSED_PRICE_USDC, LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC);
    assert.notEqual(PROPOSED_PRICE_USDC, FIXTURE_PRICE_USDC);
    assert.notEqual(FIXTURE_PRICE_USDC, LIVE_EXTRACT_PRICE_USDC);
  });

  it("Mcp.tsx extract remains $0.005 and useful-jobs stay without purchase authority", () => {
    const mcp = readFileSync(join(REPO_ROOT, "client/src/pages/Mcp.tsx"), "utf8");
    assert.match(mcp, /name: "extract"/);
    assert.match(mcp, /price: "\$0\.005"/);
    const openapi = JSON.parse(
      readFileSync(join(REPO_ROOT, "fixtures/presence/catalog/openapi.json"), "utf8"),
    );
    assert.equal(
      openapi.paths["/commerce/seller-integrity-audit"].get["x-payment-info"].price.amount,
      LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
    );
    const useful = JSON.parse(
      readFileSync(join(REPO_ROOT, "client/public/discovery/useful-jobs.json"), "utf8"),
    );
    assert.equal(useful.purchaseAuthority, false);
    assert.equal(useful.paidHostedClaim, false);
  });
});
