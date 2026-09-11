import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  LIVE_EXTRACT,
  LIVE_PAY_TO,
  LIVE_SELLER_INTEGRITY_AUDIT,
  REPO_ROOT,
} from "../lib/pins.mjs";

describe("existing live prices stay unchanged", () => {
  it("pins extract $0.005 from the committed catalog", () => {
    const catalog = JSON.parse(
      readFileSync(join(REPO_ROOT, "fixtures/buyer-runtimes/catalog.json"), "utf8"),
    );
    assert.equal(String(catalog.route.mcpPriceUsd), LIVE_EXTRACT.usdc);
    assert.equal(catalog.contract.priceUsd, 0.005);
    assert.equal(catalog.contract.amount, LIVE_EXTRACT.amount);
    assert.equal(catalog.contract.payTo, LIVE_PAY_TO);
  });

  it("Mcp.tsx extract remains $0.005 and seller-integrity-audit remains $0.01", () => {
    const mcp = readFileSync(join(REPO_ROOT, "client/src/pages/Mcp.tsx"), "utf8");
    assert.match(mcp, /name: "extract"/);
    assert.match(mcp, /price: "\$0\.005"/);
    const sia = mcp.indexOf('name: "seller_integrity_audit"');
    assert.ok(sia >= 0);
    assert.match(mcp.slice(sia, sia + 80), /price: "\$0\.01"/);

    const openapi = JSON.parse(
      readFileSync(join(REPO_ROOT, "fixtures/presence/catalog/openapi.json"), "utf8"),
    );
    assert.equal(
      openapi.paths["/commerce/seller-integrity-audit"].get["x-payment-info"].price.amount,
      LIVE_SELLER_INTEGRITY_AUDIT.usdc,
    );

    const verified = JSON.parse(
      readFileSync(join(REPO_ROOT, "client/public/x402/verified.json"), "utf8"),
    );
    const extract = verified.routes.find((row) => row.route === "/extract");
    assert.ok(extract);
    assert.equal(extract.price.amount, LIVE_EXTRACT.amount);
    assert.equal(extract.price.display, LIVE_EXTRACT.display);
  });
});
