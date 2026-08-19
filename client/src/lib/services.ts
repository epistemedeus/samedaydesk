// The four public offers, mirrored from shared/offers.json.
// shared/offers.json is the single source of truth: the server reads it directly and the
// parity check fails the build if this file drifts from it. Keep the two in step by hand;
// there are four rows and they change about once a year.
export type Offer = {
  slug: string;
  name: string;
  price: number; // cents
  priceLabel: string;
  path: string;
  clock: string;
};

export const OFFERS: Offer[] = [
  { slug: "free_report", name: "Free AI Answer Report", price: 0, priceLabel: "Free", path: "/report", clock: "Eligibility on the next screen" },
  { slug: "answer_audit", name: "AI Answer Audit", price: 49000, priceLabel: "$490", path: "/pay/audit", clock: "5 business days from complete intake" },
  { slug: "correction_sprint", name: "Answer Correction Sprint", price: 240000, priceLabel: "$2,400", path: "/pay/sprint", clock: "15 business days from complete access" },
  { slug: "correction_sprint_plus", name: "Correction Sprint Plus", price: 480000, priceLabel: "$4,800", path: "/pay/sprint-plus", clock: "20 business days from complete access" },
];

export const ALL_OFFERS = OFFERS;

export function findOffer(slug: string | null | undefined): Offer | undefined {
  return OFFERS.find((o) => o.slug === slug);
}
