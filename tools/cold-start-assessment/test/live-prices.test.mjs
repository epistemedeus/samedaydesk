import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { LIVE_EXTRACT, LIVE_SELLER_INTEGRITY_AUDIT, PROPOSED_PRICE } from "../src/catalog.mjs";
import { REPO_ROOT } from "../src/paths.mjs";

function read(rel) {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

test("proposed $5 is not a live catalog price; extract $0.005 is unchanged", () => {
  const verified = JSON.parse(read("client/public/x402/verified.json"));
  const extract = verified.routes.find((row) => row.route === "/extract");
  assert.ok(extract, "live extract route missing");
  assert.equal(extract.price.amount, LIVE_EXTRACT.amount);
  assert.equal(extract.price.display, LIVE_EXTRACT.display);
  assert.notEqual(extract.price.amount, "5000000");
  assert.equal(
    verified.routes.some((row) => row.price?.display === "5.000000 USDC" || row.price?.amount === "5000000"),
    false,
  );
});

test("seller-integrity-audit remains $0.01", () => {
  const crawl = JSON.parse(read("client/src/data/sellerConformanceCrawl.json"));
  const row = crawl.routes.find((item) => item.route === "/commerce/seller-integrity-audit");
  assert.ok(row, "seller-integrity-audit crawl row missing");
  assert.equal(row.unpaid402.amount, LIVE_SELLER_INTEGRITY_AUDIT.amount);
});

test("assessment source never sends payment or GitHub credential headers", () => {
  const src = [
    "src/fetch.mjs",
    "src/acquire.mjs",
    "src/assess.mjs",
    "src/settle-guard.mjs",
    "src/commands.mjs",
  ]
    .map((rel) => read(join("tools/cold-start-assessment", rel)))
    .join("\n");
  assert.match(src, /payment_header_forbidden|FORBIDDEN_REQUEST_HEADERS/);
  assert.match(src, /github_not_required/);
  assert.doesNotMatch(src, /headers:\s*\{[^}]*Authorization/i);
  assert.doesNotMatch(src, /PAYMENT-SIGNATURE\s*:/);
  assert.doesNotMatch(src, /settlePayment\(/);
});

test("proposed price stays labelled fixture", () => {
  assert.equal(PROPOSED_PRICE.amount, "5.000000");
  assert.equal(PROPOSED_PRICE.asset, "USDC");
  assert.equal(PROPOSED_PRICE.network, "fixture");
});
