// Server-authoritative pricing. The client sends an offer SLUG only — never an amount.
// Adding a new gig = one entry here + one card in the client service config. Extensible by design.
export const CURRENCY = "usd";

export const OFFERS = {
  // Edge-fit catalog (session 0007): data / code / AI / search. Self-serve, collected via live Stripe.
  data_cleanup:     { amount: 3900,  label: "Spreadsheet Cleanup & Dedup",    category: "data" },
  lead_list:        { amount: 6900,  label: "Local Business Lead List",       category: "data", flagship: true },
  scrape_csv:       { amount: 8900,  label: "Scrape to Spreadsheet",          category: "data" },
  bug_fix:          { amount: 4900,  label: "Script / Bug Fix",               category: "code", flagship: true },
  automation_build: { amount: 14900, label: "Automation / Integration Build", category: "code" },
  rag_bot:          { amount: 39900, label: "RAG Chatbot Over Your Docs",     category: "ai", flagship: true },
  mcp_server:       { amount: 34900, label: "Custom MCP Server",              category: "ai" },
  ai_audit:         { amount: 24900, label: "AI-Search Visibility Audit",     category: "search" },
  // GEO done-for-you service (2026-07-01 reset — the durable bet). Priced to CLOSE, not to max.
  geo_audit:        { amount: 19900, label: "AI Visibility Audit",            category: "geo", flagship: true },
  geo_fix:          { amount: 39900, label: "AI Visibility Audit + Fix (done-for-you)", category: "geo", bestValue: true },
  geo_sprint:       { amount: 49900, label: "AI Visibility Sprint (multi-location)",    category: "geo" },
  // geo_retainer: $1,500-3,000/mo — sold as a custom Payment Link (createInstantLink), not a fixed SKU.
  // Career / copy (original catalog)
  resume_linkedin: { amount: 5900, label: "Résumé + LinkedIn Rewrite", category: "career" },
  cover_letter:    { amount: 3900, label: "Custom Cover Letter",        category: "career" },
  landing_copy:    { amount: 6900, label: "Landing Page Copy Refresh",  category: "copy" },
  bundle_all:      { amount: 7900, label: "Application Pack (Résumé + LinkedIn + Cover Letter)", category: "bundle", bestValue: true },
  // custom_quote: operator sets the amount on an instant Payment Link (handled in checkout/links).
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
