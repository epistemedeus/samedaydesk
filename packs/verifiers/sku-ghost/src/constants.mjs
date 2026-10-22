/** SDS SKU-ghost verifier — advertised offer slugs vs server/pricing.js. */

export const PACKAGE_ID = "SDS-SKU-GHOST-VERIFIER";
export const VERDICT_SCHEMA = "sds.sku_ghost_verifier.verdict.v1";
export const VERIFIER = "sku-ghost";

export const AUTHORITATIVE_REL = "server/pricing.js";
export const CLIENT_CATALOG_REL = "client/src/lib/services.ts";
export const LLMS_REL = "client/public/llms.txt";

export const CUSTOM_QUOTE_SLUG = "custom_quote";

export const LLMS_LABEL_ALIASES = Object.freeze({
  "Agent Workflow Integration": "agent_workflow",
  "Agent-Ready MCP Server": "agent_mcp_server",
  "x402 and native MPP Payment Route": "machine_payment_route",
  "x402 + MPP Payment Route": "machine_payment_route",
  "Agent Commerce Storefront": "agent_storefront",
});

export const REASON = Object.freeze({
  GHOST_SKU: "ghost_sku",
  SKU_PRICE_MISMATCH: "sku_price_mismatch",
  SILENT_EMPTY_SUCCESS: "silent_empty_success",
  SKU_CHANGE_REFUSED: "sku_change_refused",
  PUBLISH_ATTEMPTED: "publish_attempted",
  CHECKOUT_TOUCHED: "checkout_touched",
  INVALID_JSON: "invalid_json",
  INVALID_DOCUMENT: "invalid_document",
  COMMITTED_SURFACES_UNAVAILABLE: "committed_surfaces_unavailable",
  USAGE: "usage",
});

export const FAILURES = Object.freeze({
  ghost_sku: "Advertised SKU slug is not in server/pricing.js OFFERS",
  sku_price_mismatch: "Advertised cents do not match server/pricing.js for that slug",
  silent_empty_success: "HTTP-shaped or fixture success with no advertised SKUs (empty body, {}, ok:true, or advertised:[])",
  sku_change_refused: "Attempt to edit live prices or SKUs is refused; this verifier only records them",
  publish_attempted: "Publish / catalog-write flag is refused",
  checkout_touched: "Checkout / payment / pay flag is refused",
  invalid_json: "Body is not JSON",
  invalid_document: "JSON is not a plain object",
  committed_surfaces_unavailable: "Committed pricing.js / services.ts / llms.txt were not found",
  usage: "CLI usage error",
});

export const HONESTY_NOTES = Object.freeze([
  "Independent oracle over committed SDS offer slugs. Does not call checkout or Stripe.",
  "server/pricing.js is authoritative. Client catalog and llms.txt are advertisements.",
  "custom_quote is operator-variable and is not a fixed SKU.",
  "seller_contract_repair may exist only on the server map; unadvertised is not a ghost.",
  "Empty advertised catalogs are silent_empty_success, not ok:true.",
  "purchaseAuthority is always false. skuChange is always false. liveSdsPricesUnchanged is always true.",
]);
