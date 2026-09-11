import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import {
  LIVE_EXTRACT_ATOMIC,
  LIVE_EXTRACT_PRICE_USDC,
  LIVE_NETWORK,
  LIVE_SELLER_INTEGRITY_AUDIT_ATOMIC,
  LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
  REPO_ROOT,
} from "../src/pins.mjs";

describe("live SDS prices are unchanged", () => {
  test("pins match extract $0.005 atomic 5000 and integrity-audit $0.01 atomic 10000", () => {
    assert.equal(LIVE_EXTRACT_PRICE_USDC, "0.005");
    assert.equal(LIVE_EXTRACT_ATOMIC, "5000");
    assert.equal(LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC, "0.01");
    assert.equal(LIVE_SELLER_INTEGRITY_AUDIT_ATOMIC, "10000");
    assert.equal(LIVE_NETWORK, "eip155:8453");
  });

  test("Mcp.tsx extract remains $0.005 and seller_integrity_audit $0.01", () => {
    const mcp = readFileSync(path.join(REPO_ROOT, "client/src/pages/Mcp.tsx"), "utf8");
    assert.match(mcp, /name: "extract"/);
    assert.match(mcp, /price: "\$0\.005"/);
    assert.match(mcp, /name: "seller_integrity_audit"/);
    assert.match(mcp, /price: "\$0\.01"/);
  });

  test("unpaid catalog and OpenAPI still list the live amounts", () => {
    const catalog = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "fixtures/buyer-runtimes/catalog.json"), "utf8"),
    );
    assert.equal(String(catalog.route.mcpPriceUsd), LIVE_EXTRACT_PRICE_USDC);
    assert.equal(String(catalog.contract.amount), LIVE_EXTRACT_ATOMIC);
    assert.equal(catalog.contract.network, LIVE_NETWORK);

    const openapi = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "fixtures/presence/catalog/openapi.json"), "utf8"),
    );
    assert.equal(
      openapi.paths["/commerce/seller-integrity-audit"].get["x-payment-info"].price.amount,
      LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
    );
  });

  test("this feature did not add server/paid-useful-jobs or edit pricing.js", () => {
    const pricing = readFileSync(path.join(REPO_ROOT, "server/pricing.js"), "utf8");
    assert.match(pricing, /agent_workflow/);
    assert.doesNotMatch(pricing, /pre-spend-cost-assurance/);
  });
});
