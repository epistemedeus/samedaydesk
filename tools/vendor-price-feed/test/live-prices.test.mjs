import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  LIVE_EXTRACT_ATOMIC,
  LIVE_EXTRACT_PRICE_USDC,
  LIVE_PRICE_FILES,
  LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
  REPO_ROOT,
  liveFileSnapshot,
} from "../lib/pins.mjs";
import { parseStdout, runCli, TOOL_DIR } from "./helpers.mjs";

describe("live SDS catalog prices stay unchanged", () => {
  it("journey does not mutate pinned live price files", () => {
    const before = liveFileSnapshot();
    const r = runCli(["journey", "--fixture", "fixtures/ok.json"], { cwd: TOOL_DIR });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = parseStdout(r);
    assert.equal(body.liveCatalogWritten, false);
    const after = liveFileSnapshot();
    assert.deepEqual(after, before);
    for (const rel of LIVE_PRICE_FILES) {
      assert.equal(before[rel].exists, true, rel);
      assert.match(before[rel].sha256, /^[0-9a-f]{64}$/);
    }
  });

  it("extract remains $0.005 and seller-integrity-audit remains 0.01", () => {
    const mcp = readFileSync(join(REPO_ROOT, "client/src/pages/Mcp.tsx"), "utf8");
    assert.match(mcp, /name: "extract"/);
    assert.match(mcp, /price: "\$0\.005"/);

    const catalog = JSON.parse(
      readFileSync(join(REPO_ROOT, "fixtures/buyer-runtimes/catalog.json"), "utf8"),
    );
    assert.equal(String(catalog.route.mcpPriceUsd), LIVE_EXTRACT_PRICE_USDC);
    assert.equal(catalog.contract.priceUsd, 0.005);
    assert.equal(catalog.contract.amount, LIVE_EXTRACT_ATOMIC);

    const verified = JSON.parse(
      readFileSync(join(REPO_ROOT, "client/public/x402/verified.json"), "utf8"),
    );
    const extract = verified.routes.find((row) => row.route === "/extract");
    assert.equal(extract.price.display, "0.005 USDC");
    assert.equal(extract.price.amount, LIVE_EXTRACT_ATOMIC);

    const sia = verified.routes.find((row) => row.route === "/commerce/seller-integrity-audit");
    assert.equal(sia.price.display, "0.01 USDC");
    assert.equal(sia.price.amount, "10000");

    const useful = JSON.parse(
      readFileSync(join(REPO_ROOT, "client/public/discovery/useful-jobs.json"), "utf8"),
    );
    assert.equal(useful.purchaseAuthority, false);
    assert.equal(LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC, "0.01");
  });
});
