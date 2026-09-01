// Server-authoritative pricing. The client sends an offer SLUG only — never an amount.
// Adding a new gig = one entry here + one card in the client service config. Extensible by design.
export const CURRENCY = "usd";

export const OFFERS = {
  agent_workflow:        { amount: 14900, label: "Agent Workflow Integration", category: "build" },
  agent_mcp_server:      { amount: 34900, label: "Agent-Ready MCP Server", category: "build", flagship: true },
  machine_payment_route: { amount: 49900, label: "x402 + MPP Payment Route", category: "payments" },
  agent_storefront:      { amount: 99900, label: "Agent Commerce Storefront", category: "payments", bestValue: true },
  seller_contract_repair: { amount: 49000, label: "One-route seller contract repair", category: "repair" },
  // custom_quote: operator sets the amount on an instant Payment Link.
};

export function getOffer(slug) {
  return Object.prototype.hasOwnProperty.call(OFFERS, slug) ? OFFERS[slug] : null;
}

// Re-validate pricing from Stripe metadata at fulfillment time (never trust the client).
export function trustPricingFromMetadata(meta = {}) {
  const offer = getOffer(meta.offer);
  if (offer && Number(meta.amount) === offer.amount) {
    return { offer: meta.offer, label: offer.label, amount: offer.amount };
  }
  // custom_quote or anything else: fall back to the stamped amount (operator-set link).
  return { offer: meta.offer || "custom_quote", label: meta.label || "Custom work", amount: Number(meta.amount) || 0 };
}
