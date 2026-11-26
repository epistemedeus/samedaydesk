import { AGENT_FIRST_USE_REPORT, firstUseCheckoutEnabled } from "../pricing.js";
import { CARE_OFFERS } from "../lib/care-contract.js";

// Reuse only the 49 / 100 / 499 catalog entries the current plan names, and
// only when those offers are actually available. The first-use report stays
// off unless SDS_AGENT_FIRST_USE_REPORT is set.
const REQUESTED_OFFERS = Object.freeze([
  {
    offer: AGENT_FIRST_USE_REPORT,
    cents: 4900,
    href: "/checkout?offer=agent_first_use_report",
    title: "Agent first-use report",
  },
  {
    offer: "keep_it_working",
    cents: 10000,
    href: "/care/buy?offer=keep_it_working",
    title: "Keep it working",
    interval: "month",
  },
  {
    offer: "machine_payment_route",
    cents: 49900,
    href: "/care/buy?offer=machine_payment_route",
    title: "Get paid by AI agents",
  },
]);

export function availableCatalogOffers(env = process.env) {
  return REQUESTED_OFFERS.filter((item) => {
    if (item.offer === AGENT_FIRST_USE_REPORT) return firstUseCheckoutEnabled(env);
    return Object.hasOwn(CARE_OFFERS, item.offer);
  }).map((item) => Object.freeze({ ...item, currency: "usd" }));
}
