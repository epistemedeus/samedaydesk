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

  const agentToll = findSellerRepairBrief("agenttoll-market-radar-20260901");
  assert.equal(agentToll?.seller, "AgentToll");
  assert.equal(agentToll?.origin, "https://agenttoll.dev");
  assert.equal(agentToll?.route, "/paid/x402/market-radar");
  assert.equal(agentToll?.method, "POST");
  assert.equal(agentToll?.routeClass, "paid_post");
  assert.equal(agentToll?.observedAt, "2026-09-01 PDT");
  assert.equal(agentToll?.livePrice, "0.05 USDC");
  assert.match(agentToll?.requiredContract[0] || "", /product, service, generated_at, catalog, and agenttoll/);
  assert.match(agentToll?.requiredContract[1] || "", /nested report objects extensible/);
  assert.match(
    agentToll?.scope[2] || "",
    /No request, price, network, asset, recipient, handler, payment, or settlement behavior change/,
  );
  assert.match(
    agentToll?.boundaries[0] || "",
    /No credential, wallet, signature, paid request, or target payment/,
  );
  assert.equal(
    agentToll?.scope[0],
    "Open free repair PR 4 aligns only those five stable top-level fields across OpenAPI and Bazaar.",
  );
  assert.equal(
    agentToll?.boundaries[1],
    "Open free repair PR 4 is not paid delivery, settled revenue, or evidence of independent use.",
  );
  assert.equal(agentToll?.evidence[1]?.label, "Open free repair PR 4");

  const argonaut = findSellerRepairBrief("argonaut-ecb-fx-reference-20260902");
  assert.equal(argonaut?.seller, "ArgonautWorks ECB FX Reference");
  assert.equal(argonaut?.origin, "https://official-fx-reference.vercel.app");
  assert.equal(argonaut?.route, "/api/v1/convert");
  assert.equal(argonaut?.method, "POST");
  assert.equal(argonaut?.routeClass, "paid_post");
  assert.equal(argonaut?.observedAt, "2026-09-02");
  assert.equal(argonaut?.livePrice, "0.0015 USDC on Base");
  assert.match(argonaut?.summary || "", /live GET and POST conversion route/);
  assert.match(
    argonaut?.observedContract[1] || "",
    /source\.provider, source\.dataset, source\.url, source\.available_free, cache\.stale, or cache\.age_ms/,
  );
  assert.match(argonaut?.requiredContract[0] || "", /source\.provider/);
  assert.match(argonaut?.requiredContract[1] || "", /cache\.stale and cache\.age_ms/);
  assert.equal(
    argonaut?.scope[0],
    "Open free repair PR 3 requires only those six handler-owned nested fields for /api/v1/convert.",
  );
  assert.equal(
    argonaut?.boundaries[1],
    "Open free repair PR 3 is not merged or deployed and does not establish buyer use, payment, demand, or revenue.",
  );
  assert.equal(argonaut?.evidence[1]?.label, "Open free repair PR 3");
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
    "https://samedaydesk.com/x402/seller-conformance/?finding=onesource-erc20-balance-20260830",
  );
  const mailto = decodeURIComponent(sellerRepairScopeMailto(brief));
  assert.match(mailto, /Finding ID: onesource-erc20-balance-20260830/);
  assert.match(mailto, /Route: GET \/api\/chain\/erc20-balance/);
  assert.match(mailto, /fixed one-route \$490 scope/);
});
