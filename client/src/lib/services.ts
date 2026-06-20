// Config-driven service catalog. Adding a gig or whole category = one entry here.
// The brand is "a same-day desk", not "a résumé service". This list is meant to grow.
export type Offer = {
  slug: string;
  name: string;
  price: number; // USD
  turnaround: string;
  blurb: string;
  includes: string[];
  flagship?: boolean;
  bestValue?: boolean;
};

export type Category = {
  id: string;
  label: string;
  tagline: string;
  offers: Offer[];
};

export const CATEGORIES: Category[] = [
  {
    id: "career",
    label: "Career",
    tagline: "Land the interview.",
    offers: [
      {
        slug: "resume_linkedin",
        name: "Résumé + LinkedIn",
        price: 59,
        turnaround: "Same day",
        flagship: true,
        blurb: "A full rewrite of your résumé plus a matching LinkedIn headline & About, tuned to your target role and built to pass ATS screens.",
        includes: ["Full résumé rewrite", "LinkedIn headline + About", "ATS-friendly formatting", "Tailored to 1 target role", "One revision round", "Editable Doc + PDF"],
      },
      {
        slug: "cover_letter",
        name: "Cover Letter",
        price: 39,
        turnaround: "Same day",
        blurb: "A sharp, specific cover letter written for one job posting, matched to the company's tone. Never a template.",
        includes: ["Tailored to one job posting", "Matched to company tone", "One revision round", "Editable Doc + PDF"],
      },
    ],
  },
  {
    id: "copy",
    label: "Copy",
    tagline: "Words that convert.",
    offers: [
      {
        slug: "landing_copy",
        name: "Landing Page Copy",
        price: 69,
        turnaround: "24 hours",
        blurb: "Conversion-focused copy for one page: headline, value proposition, body sections, and CTA, delivered ready to paste in.",
        includes: ["Headline + subhead + value prop", "Up to 5 body sections", "Clear CTA + microcopy", "Tone matched to your brand", "One revision round"],
      },
    ],
  },
  {
    id: "bundle",
    label: "Bundles",
    tagline: "Best value.",
    offers: [
      {
        slug: "bundle_all",
        name: "Application Pack",
        price: 79,
        turnaround: "Same day",
        bestValue: true,
        blurb: "Résumé rewrite + matching LinkedIn + one tailored cover letter. The complete kit for an active job search.",
        includes: ["Everything in Résumé + LinkedIn", "One tailored cover letter", "Best value for an active search", "One revision round"],
      },
    ],
  },
];

// The open-amount path: operator sends an instant Payment Link after agreeing scope.
export const CUSTOM = {
  slug: "custom_quote",
  name: "Something else?",
  blurb: "Small code fixes, spreadsheet/data cleanup, or custom writing. Send the task, you get a flat quote before any work starts.",
};

export const ALL_OFFERS: Offer[] = CATEGORIES.flatMap((c) => c.offers);
export const flagship = ALL_OFFERS.find((o) => o.flagship)!;
