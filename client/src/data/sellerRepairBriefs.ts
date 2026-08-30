export type SellerRepairBrief = Readonly<{
  id: string;
  seller: string;
  origin: string;
  route: string;
  method: "GET" | "POST";
  routeClass: "paid_get" | "paid_post";
  observedAt: string;
  livePrice: string;
  summary: string;
  observedContract: readonly string[];
  requiredContract: readonly string[];
  scope: readonly string[];
  boundaries: readonly string[];
  evidence: readonly Readonly<{ label: string; href: string }>[];
}>;

export const sellerRepairBriefs = Object.freeze([
  {
    id: "hypernatt-liq-radar-20260830",
    seller: "HyperNatt Terminal",
    origin: "https://hypernatt.com",
    route: "/api/m2m/liq-radar",
    method: "GET",
    routeClass: "paid_get",
    observedAt: "2026-08-30",
    livePrice: "0.001 USDC",
    summary:
      "The live Base and Solana offer describes a detailed liquidation-radar payload, but the formal success contracts do not guarantee those fields before payment.",
    observedContract: [
      "OpenAPI describes HTTP 200 only as OK, without a media type or schema.",
      "The live Bazaar schema requires output.type but leaves output.example unconstrained.",
      "The example advertises product, payload_schema, symbol, and liq_radar without requiring any of them.",
    ],
    requiredContract: [
      "Declare the successful application/json response schema for the exact route.",
      "Require a stable handler-owned core and recursively require every buyer-critical path.",
      "Keep variable arrays and optional market observations optional unless runtime behavior guarantees them.",
    ],
    scope: [
      "One truthful OpenAPI 200 schema and matching Bazaar projection.",
      "Credential-free contract, parity, and live unpaid-402 tests.",
      "No handler, price, rail, wallet, recipient, or payment-middleware change.",
    ],
    boundaries: [
      "No credential, signature, target request, wallet action, or target payment was used to reproduce this finding.",
      "The seller confirms the real runtime types and semantics before any schema repair is merged.",
    ],
    evidence: [
      { label: "Live unpaid 402 route", href: "https://hypernatt.com/api/m2m/liq-radar" },
      { label: "Public OpenAPI", href: "https://hypernatt.com/openapi.json" },
    ],
  },
  {
    id: "onesource-erc20-balance-20260830",
    seller: "OneSource",
    origin: "https://api.onesource.io",
    route: "/api/chain/erc20-balance",
    method: "GET",
    routeClass: "paid_get",
    observedAt: "2026-08-30",
    livePrice: "0.003 USDC",
    summary:
      "OpenAPI, the live Bazaar contract, the advertised example, and the live payment amount disagree on the exact request and result a buyer should authorize.",
    observedContract: [
      "OpenAPI requires address and contract; the live Bazaar input requires account and token.",
      "The success schema requires data and meta but does not require a handler-owned field inside data, including balance.",
      "The live payment schemes require 3,000 atomic USDC while the Bazaar output example says cost_usdc 0.001.",
    ],
    requiredContract: [
      "Choose one authoritative request vocabulary and project it identically through OpenAPI and Bazaar.",
      "Require the stable handler-owned balance result and any buyer-critical metadata.",
      "Reconcile the advertised example price with the live offer amount.",
    ],
    scope: [
      "One-route OpenAPI and Bazaar coherence repair with focused regression tests.",
      "A buyer-constructibility and success-contract replay against the credential-free live 402.",
      "No handler, price, rail, wallet, recipient, or payment-middleware change unless the seller identifies a different authority.",
    ],
    boundaries: [
      "No credential, signature, target application request, wallet action, or target payment was used to reproduce this finding.",
      "The seller confirms which parameter names, result fields, and price are authoritative before a repair is merged.",
    ],
    evidence: [
      { label: "Live unpaid 402 route", href: "https://api.onesource.io/api/chain/erc20-balance" },
      { label: "Public OpenAPI", href: "https://api.onesource.io/openapi.json" },
    ],
  },
  {
    id: "402-com-tr-morpho-health-20260830",
    seller: "x402 Bazaar",
    origin: "https://402.com.tr",
    route: "/api/x402/morpho-health",
    method: "GET",
    routeClass: "paid_get",
    observedAt: "2026-08-30",
    livePrice: "0.04 USDC on Base or Polygon",
    summary:
      "The live offer describes decision-grade Morpho liquidation health, but neither OpenAPI nor Bazaar formally guarantees a single returned field before payment.",
    observedContract: [
      "OpenAPI declares the HTTP 200 body only as an object, without properties or required fields.",
      "The live Bazaar schema requires output.type but leaves output.example as an unconstrained object.",
      "The example advertises checkedAt, wallet, market, pair, verdict, collateral, collateralToken, and borrowed without requiring any of them.",
    ],
    requiredContract: [
      "Require the stable handler-owned fields shared by every successful result, including checkedAt, wallet, market, pair, and verdict.",
      "Model active-position and no_borrow outcomes separately so health, LTV, and liquidation fields are required only when the handler guarantees them.",
      "Project the same schema through OpenAPI and Bazaar and keep the public example schema-valid.",
    ],
    scope: [
      "One truthful OpenAPI 200 schema and matching Bazaar projection for every existing success branch.",
      "Credential-free request, success-branch, parity, recursive-required-path, and unchanged live-402 tests.",
      "No handler, price, rail, recipient, prepaid-credit, middleware, or settlement change.",
    ],
    boundaries: [
      "No credential, signature, target paid request, wallet action, or target payment was used to reproduce this finding.",
      "The seller confirms the real branch shapes and field semantics before any schema repair is merged.",
    ],
    evidence: [
      {
        label: "Live unpaid 402 route",
        href: "https://402.com.tr/api/x402/morpho-health?wallet=0x973a31858f4d2125f48c880542da11a2796f12d6",
      },
      { label: "Public OpenAPI", href: "https://402.com.tr/openapi.json" },
      {
        label: "Public operator repository",
        href: "https://github.com/sukrutkrdg/x402-bazaar-mcp",
      },
    ],
  },
  {
    id: "scrape402-crypto-20260830",
    seller: "scrape402",
    origin: "https://x402.shizu.me",
    route: "/crypto",
    method: "GET",
    routeClass: "paid_get",
    observedAt: "2026-08-30",
    livePrice: "0.007 USDC on Base",
    summary:
      "The live route advertises current crypto prices for one or up to ten pairs, but OpenAPI and Bazaar do not formally guarantee the single-pair fields or the batch envelope before payment.",
    observedContract: [
      "OpenAPI provides a 200 example with pair, amount, and currency but no response schema.",
      "The live Bazaar declaration publishes an output example but no formal output schema.",
      "OpenAPI makes pair optional while the live Bazaar input contract requires it.",
      "The advertised multi-pair mode has no buyer-visible envelope or per-item guarantee.",
    ],
    requiredContract: [
      "Choose one authoritative pair-input rule and declare the successful JSON shape for both single-pair and multi-pair requests.",
      "Require pair, amount, and currency on every returned price item and define the batch envelope exactly.",
      "Project the same success contract through OpenAPI and Bazaar and keep both examples schema-valid.",
    ],
    scope: [
      "One truthful OpenAPI 200 schema and matching Bazaar projection for the existing route modes.",
      "Credential-free single-pair, multi-pair, parity, recursive-required-path, and unchanged live-402 tests.",
      "No handler, price, rail, recipient, payment middleware, or production-source assumption.",
    ],
    boundaries: [
      "No credential, signature, target paid request, wallet action, or target payment was used to reproduce this finding.",
      "The public repository contains calling examples, not the production server source; the operator confirms the real branch shapes before any repair.",
    ],
    evidence: [
      { label: "Live unpaid 402 route", href: "https://x402.shizu.me/crypto" },
      { label: "Public OpenAPI", href: "https://x402.shizu.me/openapi.json" },
      {
        label: "Public examples repository",
        href: "https://github.com/scrape402/x402-examples",
      },
    ],
  },
] satisfies readonly SellerRepairBrief[]);

const briefsById = new Map(sellerRepairBriefs.map((brief) => [brief.id, brief]));

export function findSellerRepairBrief(id: string | null): SellerRepairBrief | null {
  if (!id) return null;
  return briefsById.get(id) ?? null;
}

export function sellerRepairBriefUrl(id: string): string {
  return `https://samedaydesk.com/x402/seller-conformance?finding=${encodeURIComponent(id)}`;
}

export function sellerRepairScopeMailto(brief: SellerRepairBrief): string {
  const subject = `Seller repair scope: ${brief.id}`;
  const body = [
    `Finding ID: ${brief.id}`,
    `Seller origin: ${brief.origin}`,
    `Route: ${brief.method} ${brief.route}`,
    `Public brief: ${sellerRepairBriefUrl(brief.id)}`,
    "",
    "I approve the fixed one-route $490 scope. Repository:",
    "",
    "Or send the free schema proposal first.",
  ].join("\n");
  return `mailto:contact@samedaydesk.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
