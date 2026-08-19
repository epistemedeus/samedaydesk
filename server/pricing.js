// Server-authoritative pricing. The client sends an offer SLUG only, never an amount.
// The four offers and their amounts live in shared/offers.json, which is also what the
// visible page, the JSON-LD, and llms.txt are generated or checked against. Editing a
// price means editing that file; the parity check fails the build if any surface drifts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const record = JSON.parse(fs.readFileSync(path.join(root, "shared/offers.json"), "utf8"));

export const CURRENCY = record.currency;
export const RECORD = record;
export const CLOCKS = record.clocks;
export const CLOCK_SENTENCE = record.clock_sentence;

// Paid offers only. The free report has no checkout path.
export const OFFERS = Object.fromEntries(
  record.offers
    .filter((o) => o.price > 0)
    .map((o) => [
      o.slug,
      {
        amount: o.price,
        label: o.name,
        path: o.path,
        clockDays: record.clocks[o.clock_key],
        clockText: o.clock_text.replace("{n}", String(record.clocks[o.clock_key])),
        exclusion: o.exclusion,
      },
    ]),
);

export function getOffer(slug) {
  return Object.prototype.hasOwnProperty.call(OFFERS, slug) ? OFFERS[slug] : null;
}

// Business-day clock sentence, rendered from config so no template carries a literal count.
export function clockSentence(slug) {
  const offer = getOffer(slug);
  if (!offer) return "";
  return `${offer.clockText}. Business days are ${record.clocks.business_days}. ${record.clock_sentence}`;
}

// Re-validate pricing from Stripe metadata at fulfillment time (never trust the client).
export function trustPricingFromMetadata(meta = {}) {
  const offer = getOffer(meta.offer);
  if (offer && Number(meta.amount) === offer.amount) {
    return { offer: meta.offer, label: offer.label, amount: offer.amount };
  }
  return { offer: meta.offer || "unknown", label: meta.label || "SameDayDesk order", amount: Number(meta.amount) || 0 };
}
