import assert from "node:assert/strict";
import test from "node:test";

import {
  findSellerRepairBrief,
  sellerRepairBriefs,
  sellerRepairBriefUrl,
  sellerRepairScopeMailto,
} from "../src/data/sellerRepairBriefs.ts";

test("resolves stable public repair briefs and rejects unknown IDs", () => {
  const hypernatt = findSellerRepairBrief("hypernatt-liq-radar-20260830");
  assert.equal(hypernatt?.route, "/api/m2m/liq-radar");
  assert.equal(hypernatt?.livePrice, "0.001 USDC");
  assert.equal(findSellerRepairBrief("not-a-real-finding"), null);
  assert.equal(findSellerRepairBrief(null), null);

  const morpho = findSellerRepairBrief("402-com-tr-morpho-health-20260830");
  assert.equal(morpho?.route, "/api/x402/morpho-health");
  assert.equal(morpho?.livePrice, "0.04 USDC on Base or Polygon");

  const scrape402 = findSellerRepairBrief("scrape402-crypto-20260830");
  assert.equal(scrape402?.route, "/crypto");
  assert.equal(scrape402?.livePrice, "0.007 USDC on Base");

  const vibeSprings = findSellerRepairBrief("vibe-springs-btc-usd-20260830");
  assert.equal(vibeSprings?.route, "/api/price/btc-usd");
  assert.equal(vibeSprings?.livePrice, "0.002 USDC on Base");

  const blockRun = findSellerRepairBrief("blockrun-exa-search-20260830");
  assert.equal(blockRun?.route, "/api/v1/exa/search");
  assert.equal(blockRun?.method, "POST");
  assert.equal(blockRun?.routeClass, "paid_post");
  assert.equal(blockRun?.livePrice, "0.011 USDC on Base");

  const exa = findSellerRepairBrief("exa-direct-search-20260830");
  assert.equal(exa?.origin, "https://api.exa.ai");
  assert.equal(exa?.route, "/search");
  assert.equal(exa?.method, "POST");
  assert.equal(exa?.routeClass, "paid_post");
  assert.equal(exa?.livePrice, "0.007 USDC on Base or Solana");

  const driftflight = findSellerRepairBrief("driftflight-image-generation-20260830");
  assert.equal(driftflight?.origin, "https://agents.driftflight.com");
  assert.equal(driftflight?.route, "/v1/images/generate");
  assert.equal(driftflight?.method, "POST");
  assert.equal(driftflight?.routeClass, "paid_post");
  assert.equal(driftflight?.livePrice, "0.06 USDC for the default studio tier");
});

test("keeps IDs unique and every brief bounded to public non-secret evidence", () => {
  const ids = sellerRepairBriefs.map((brief) => brief.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(sellerRepairBriefs.length >= 7);
  for (const brief of sellerRepairBriefs) {
    assert.match(brief.id, /^[a-z0-9-]+$/);
    assert.match(brief.origin, /^https:\/\//);
    assert.match(brief.route, /^\/(?!\/)/);
    assert.ok(brief.evidence.length >= 2);
    const serialized = JSON.stringify(brief).toLowerCase();
    assert.doesNotMatch(serialized, /bearer |api[_-]?key|private[_-]?key|authorization:/);
  }
});

test("builds one canonical brief URL and a context-preserving scope action", () => {
  const brief = findSellerRepairBrief("onesource-erc20-balance-20260830");
  assert.ok(brief);
  assert.equal(
    sellerRepairBriefUrl(brief.id),
    "https://samedaydesk.com/x402/seller-conformance?finding=onesource-erc20-balance-20260830",
  );
  const mailto = decodeURIComponent(sellerRepairScopeMailto(brief));
  assert.match(mailto, /Finding ID: onesource-erc20-balance-20260830/);
  assert.match(mailto, /Route: GET \/api\/chain\/erc20-balance/);
  assert.match(mailto, /fixed one-route \$490 scope/);
});
