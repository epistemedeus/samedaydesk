// Server-authoritative pricing. The client sends an offer SLUG only — never an amount.
// Adding a new gig = one entry here + one card in the client service config. Extensible by design.
export const CURRENCY = "usd";

export const OFFERS = {
  resume_linkedin: { amount: 5900, label: "Résumé + LinkedIn Rewrite", category: "career", flagship: true },
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
