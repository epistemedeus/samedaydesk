// Config-driven service catalog. Adding a gig or whole category = one entry here
// (and a matching slug+amount in server/pricing.js). The brand is "a same-day desk",
// not "a résumé service". This list is meant to grow; edge-fit work (data / code / AI /
// search) leads, career/copy follows.
export type Offer = {
  slug: string;
  name: string;
  price: number; // USD
  turnaround: string;
  blurb: string;
  includes: string[];
  flagship?: boolean;
  bestValue?: boolean;
  // Per-offer checkout intake hint (label/placeholder/accepted files). Falls back to a
  // career-style default in Checkout when omitted.
  intake?: { label: string; placeholder: string; accept: string };
};

export type Category = {
  id: string;
  label: string;
  tagline: string;
  offers: Offer[];
};

export const CATEGORIES: Category[] = [
  {
    id: "data",
    label: "Data",
    tagline: "Clean data, same day.",
    offers: [
      {
        slug: "lead_list",
        name: "Local Business Lead List",
        price: 69,
        turnaround: "Same day",
        flagship: true,
        blurb: "500 verified local businesses for your niche and city, pulled from public sources. Deduped, validated, ready to use.",
        includes: ["500 businesses in your niche + city", "Name, address, phone, website, category", "Email + socials where publicly listed", "Deduped and validated", "Clean CSV + XLSX", "Same-day delivery"],
        intake: { label: "Your niche + city (and any must-have fields)", placeholder: "e.g. HVAC contractors in Phoenix AZ. Need name, phone, website, and email where listed.", accept: ".csv,.xlsx,.txt" },
      },
      {
        slug: "data_cleanup",
        name: "Spreadsheet Cleanup & Dedup",
        price: 39,
        turnaround: "Same day",
        blurb: "Send a messy spreadsheet, get a clean one back: deduplicated, standardized, validated, and formatted.",
        includes: ["Up to 5,000 rows", "Dedupe + merge duplicates", "Standardized columns, casing, formats", "Email + phone validation", "Split / combine fields", "Clean XLSX + CSV"],
        intake: { label: "What needs fixing + your file", placeholder: "e.g. dedupe by email, split full name into first/last, standardize phone formats. File attached.", accept: ".csv,.xlsx,.xls,.tsv,.txt,.json,.zip" },
      },
      {
        slug: "scrape_csv",
        name: "Scrape to Spreadsheet",
        price: 89,
        turnaround: "Same day",
        blurb: "One public site or directory turned into a clean spreadsheet with exactly the fields you need.",
        includes: ["One public site or directory", "The fields you specify, in columns", "Handles pagination", "Deduped + validated", "Clean CSV + XLSX", "Same-day delivery"],
        intake: { label: "The public page/site + the fields you want", placeholder: "e.g. https://example.com/listings, pull title, price, location, and link into a CSV.", accept: ".csv,.xlsx,.txt" },
      },
    ],
  },
  {
    id: "code",
    label: "Code & Automation",
    tagline: "It runs, same day.",
    offers: [
      {
        slug: "bug_fix",
        name: "Script / Bug Fix",
        price: 49,
        turnaround: "Same day",
        flagship: true,
        blurb: "Send a broken or slow script. Get a fixed, runnable version with a clear explanation and a test that proves it.",
        includes: ["Python, JS / TS, shell, and more", "Fixed, runnable code", "A diff of what changed", "Plain-English explanation of the bug", "A test that proves the fix", "It runs or it's free"],
        intake: { label: "What's broken + paste or attach the code", placeholder: "e.g. this Python script throws KeyError on line 42, it should output a CSV. File attached.", accept: ".py,.js,.ts,.json,.txt,.log,.csv,.zip" },
      },
      {
        slug: "automation_build",
        name: "Automation / Integration Build",
        price: 149,
        turnaround: "Same day",
        blurb: "A small working integration or CLI built to your spec: an API client, a webhook-to-action pipeline, or a data pipeline.",
        includes: ["Built to your written spec", "API client, webhook, ETL, or CLI", "Source code + README", "A working demo run", "Tested before delivery", "Same-day delivery"],
        intake: { label: "What to automate (the spec)", placeholder: "e.g. when a form is submitted, classify it with an LLM and append a row to Google Sheets.", accept: ".txt,.md,.json,.pdf,.zip" },
      },
    ],
  },
  {
    id: "ai",
    label: "AI",
    tagline: "Ship AI that works.",
    offers: [
      {
        slug: "rag_bot",
        name: "RAG Chatbot Over Your Docs",
        price: 399,
        turnaround: "1 to 2 days",
        flagship: true,
        blurb: "A working chatbot that answers over your own documents: ingestion, embeddings, retrieval, and an embeddable widget.",
        includes: ["Ingest PDFs, docs, site export, or CSV", "Chunking + embeddings + vector index", "Retrieval + generation API endpoint", "Embeddable chat widget", "Source-cited answers", "Setup notes + handoff"],
        intake: { label: "Your docs + what it should answer", placeholder: "e.g. a support bot over these 40 PDFs, should answer product and billing questions.", accept: ".pdf,.md,.txt,.csv,.json,.docx,.zip" },
      },
      {
        slug: "mcp_server",
        name: "Custom MCP Server",
        price: 349,
        turnaround: "Same day",
        blurb: "A working Model Context Protocol server that wraps your API so agents can use it: typed tools, auth, validation, tests.",
        includes: ["Wraps your API or product", "Built from your OpenAPI / docs", "Typed tools + input validation", "Auth handling", "README + tests", "Works in Claude, Cursor, and agents"],
        intake: { label: "The API to wrap (link the docs / OpenAPI)", placeholder: "e.g. wrap our internal REST API, OpenAPI spec attached. Need search + create tools.", accept: ".json,.yaml,.yml,.txt,.md,.zip" },
      },
    ],
  },
  {
    id: "search",
    label: "Search / GEO",
    tagline: "Get found by AI search.",
    offers: [
      {
        slug: "ai_audit",
        name: "AI-Search Visibility Audit",
        price: 249,
        turnaround: "Same day",
        blurb: "Find out if ChatGPT, Perplexity, and Google AI cite your site, why not, and exactly what to fix. A report you can act on.",
        includes: ["Whether AI engines cite you, vs competitors", "AI-crawler access + robots check", "Schema / JSON-LD gaps", "Buyer-intent prompt testing", "Prioritized fix list", "PDF + shareable web report"],
        intake: { label: "Your website URL (and any competitors)", placeholder: "e.g. https://mysite.com, compare against competitora.com and competitorb.com.", accept: ".txt" },
      },
    ],
  },
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
  blurb: "Bigger volumes, a custom build, or anything not listed. Send the task, you get a flat quote before any work starts.",
};

export const ALL_OFFERS: Offer[] = CATEGORIES.flatMap((c) => c.offers);
export const flagship = ALL_OFFERS.find((o) => o.flagship)!;

// Frictionless live Stripe Payment Links. When a slug has one, the card
// links straight to checkout — no signup/email wall (the conversion killer for cold buyers).
// Edge-fit offers + custom only; amounts match server/pricing.js. See exp/0008 payment-links.md.
export const PAYMENT_LINKS: Record<string, string> = {
  lead_list:        "https://buy.stripe.com/cNicN6eoqaHJ1KL8wqeZ208",
  data_cleanup:     "https://buy.stripe.com/fZu00k6VY5npgFF4gaeZ20a",
  scrape_csv:       "https://buy.stripe.com/bJe5kE1BE9DFexx7smeZ20b",
  bug_fix:          "https://buy.stripe.com/cNi7sM4NQbLN3ST9AueZ207",
  automation_build: "https://buy.stripe.com/5kQaEYdkm3fhahhh2WeZ209",
  rag_bot:          "https://buy.stripe.com/3cIdRa5RU7vx9dd7smeZ20c",
  mcp_server:       "https://buy.stripe.com/14A4gA6VY7vxahh6oieZ20d",
  ai_audit:         "https://buy.stripe.com/fZuaEY2FI4jl2OPbICeZ206",
  custom_quote:     "https://buy.stripe.com/bJe4gAbcedTV8993c6eZ205",
};
