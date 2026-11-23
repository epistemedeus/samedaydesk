// SameDayDesk's human checkout layer. The design stays stable while this small
// catalog tracks the agent-commerce work the desk can actually deliver.
export type Offer = {
  slug: string;
  /** The plain name a business owner understands; `name` is the technical name under it. */
  plain: string;
  name: string;
  price: number;
  /** Shown after the price, for recurring offers. */
  per?: string;
  /** One line in everyday words: what changes for the business. */
  outcome: string;
  /** One short scene of it happening to one of their customers, set in italics. */
  scene: string;
  /** What the buyer receives, in plain words. */
  receive: string[];
  blurb: string;
  /** For engineers: the technical details fold. */
  includes: string[];
  flagship?: boolean;
  bestValue?: boolean;
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
    id: "build",
    label: "Agent builds",
    tagline: "Done for you, with the code.",
    offers: [
      {
        slug: "agent_workflow",
        plain: "Hand one job to AI",
        outcome: "A task your team repeats, done by AI from start to finish.",
        scene: "An order email arrives, the spreadsheet fills itself and the customer gets a reply.",
        receive: [
          "The job running on its own",
          "A live demo you can try",
          "The code, yours to keep",
          "Setup notes for your team",
        ],
        name: "Agent Workflow Integration",
        price: 149,
        blurb: "One useful workflow across the APIs and tools you already use, delivered as runnable code instead of a diagram.",
        includes: [
          "One bounded workflow",
          "Existing API, webhook, or CLI integration",
          "Typed inputs and clear failure states",
          "Source code and README",
          "A working demo run",
          "Tests for the promised path",
        ],
        intake: {
          label: "The workflow and the tools it should connect",
          placeholder: "Example: when a paid order lands, verify it, enrich the account, and write a receipt to our system.",
          accept: ".txt,.md,.json,.yaml,.yml,.pdf,.zip",
        },
      },
      {
        slug: "agent_mcp_server",
        plain: "Put your app inside ChatGPT and Claude",
        outcome: "Customers use your service by asking their AI.",
        scene: "\"Book a table for Friday,\" typed into Claude, lands in your booking system.",
        receive: [
          "Your service, usable from ChatGPT and Claude",
          "Up to five things people can ask it to do",
          "A live connection to try",
          "The code and a setup guide",
        ],
        name: "Agent-Ready MCP Server",
        price: 349,
        flagship: true,
        blurb: "Turn an existing API into a focused MCP server agents can select and call without guessing the request or response shape.",
        includes: [
          "Up to five focused tools",
          "Typed inputs and structured outputs",
          "Authentication boundary",
          "Streamable HTTP transport",
          "Tests and setup guide",
          "Public or private deployment",
        ],
        intake: {
          label: "Your API docs, OpenAPI file, or repository",
          placeholder: "Example: expose search, inspect, and create from our existing REST API. OpenAPI and repository attached.",
          accept: ".json,.yaml,.yml,.txt,.md,.pdf,.zip",
        },
      },
    ],
  },
  {
    id: "payments",
    label: "Machine payments",
    tagline: "AI agents find you, pay and come back.",
    offers: [
      {
        slug: "machine_payment_route",
        plain: "Get paid by AI agents",
        outcome: "Agents pay you each time they use your service. No sign-up, no invoice.",
        scene: "A research agent pays 5 cents a lookup, and the money is yours the same minute.",
        receive: [
          "Pay-per-use on one part of your service",
          "Payments in digital dollars, straight to you",
          "A receipt for every payment",
          "Tests that prove it works",
        ],
        name: "x402 + MPP Payment Route",
        price: 499,
        blurb: "Make one existing API operation machine-payable with exact Base USDC terms, dual-rail negotiation, and settlement evidence.",
        includes: [
          "One existing GET or POST operation",
          "x402 and native MPP payment negotiation",
          "Exact asset, amount, recipient, and route binding",
          "Idempotent retry path",
          "Settlement and receipt verification",
          "Deployment and its tests",
        ],
        intake: {
          label: "The route, repository, and intended price",
          placeholder: "Example: make POST /quote payable in Base USDC and return a verifiable receipt with the JSON result.",
          accept: ".json,.yaml,.yml,.txt,.md,.pdf,.zip",
        },
      },
      {
        slug: "agent_storefront",
        plain: "A shop AI agents can buy from",
        outcome: "AI shopping assistants find your products and buy them.",
        scene: "\"A gift under 50 dollars,\" and their assistant buys it from you.",
        receive: [
          "Up to five things agents can buy",
          "Listings AI assistants can find",
          "Payments that settle to you",
          "A guide to run it yourself",
        ],
        name: "Agent Commerce Storefront",
        price: 999,
        bestValue: true,
        blurb: "A compact machine-facing storefront for an existing service: discovery, callable examples, payment, and evidence that stay in sync.",
        includes: [
          "Up to five existing API operations",
          "OpenAPI, MCP, and A2A discovery surfaces",
          "x402 and native MPP payment routes",
          "Constructible request examples",
          "Catalog and live-term parity checks",
          "Deployment, tests, and operating guide",
        ],
        intake: {
          label: "Your service, repository, and the operations agents should buy",
          placeholder: "Example: publish five data operations with MCP discovery, dual-rail payment, and one acceptance suite.",
          accept: ".json,.yaml,.yml,.txt,.md,.pdf,.zip",
        },
      },
    ],
  },
  {
    id: "care",
    label: "Front door and care",
    tagline: "Found by AI, and kept working.",
    offers: [
      {
        slug: "agent_front_door",
        plain: "One line for your customers' AI",
        name: "Agent Front Door",
        price: 249,
        outcome: "One sentence on your site, and any AI that reads it knows how to use you.",
        scene: "A visitor pastes it into ChatGPT and is served in seconds.",
        receive: [
          "The sentence, ready to put on your site",
          "A start file AI assistants read first",
          "Your service listed where agents look",
          "Proof a fresh assistant completes one task",
        ],
        blurb: "A start file, the sentence customers send to an agent, the discovery files, and proof that a fresh agent completes one named action on your site.",
        includes: [
          "start.md and llms.txt led by the start file",
          "OpenAPI, MCP and agent card discovery",
          "A Link header and head links to the start file",
          "A cold-agent test of one named action",
        ],
      },
      {
        slug: "keep_it_working",
        plain: "Keep it working",
        name: "Monthly care",
        price: 100,
        per: "/mo",
        outcome: "We test it every month and after every change, and fix what breaks.",
        scene: "An update breaks checkout on Tuesday morning. It works again by Tuesday afternoon.",
        receive: [
          "One workflow or route watched",
          "A check every month and after your changes",
          "The fix when it breaks, included",
          "A short monthly report",
        ],
        blurb: "One workflow watched, checked each month and fixed when it breaks.",
        includes: [
          "Scheduled checks of one workflow, MCP server or payment route",
          "A re-run of its tests after each change you report",
          "Repairs within the scope of the original build",
          "Cancel at the end of any month",
        ],
      },
    ],
  },
];

export const CUSTOM = {
  slug: "custom_quote",
  name: "Something bigger?",
  blurb: "Tell us what must work. You get a written scope and a fixed price before any work starts.",
};

export const ALL_OFFERS: Offer[] = CATEGORIES.flatMap((category) => category.offers);
export const flagship = ALL_OFFERS.find((offer) => offer.flagship)!;

// Cards and report recommendations share the checkout entries qualified in release/offers.json.
export const PAYMENT_LINKS: Record<string, string> = {
  agent_workflow: "/checkout?offer=agent_workflow",
  agent_mcp_server: "/checkout?offer=agent_mcp_server",
  machine_payment_route: "/care/buy?offer=machine_payment_route",
  agent_storefront: "/care/buy?offer=agent_storefront",
  agent_front_door: "/care/buy?offer=agent_front_door",
  keep_it_working: "/care/buy?offer=keep_it_working",
  custom_quote: "https://buy.stripe.com/bJe4gAbcedTV8993c6eZ205",
};

// These scoped services use their receipt flow rather than account PaymentIntents.
export const careCheckoutFromAccount = (slug: string) =>
  slug === "agent_front_door" || slug === "keep_it_working" ? PAYMENT_LINKS[slug] : null;


// Only the two qualified account offers can continue through sign-in to checkout.
export function accountCheckoutEntry(slug: string | null | undefined): string | null {
  if (!slug || !ALL_OFFERS.some((offer) => offer.slug === slug)) return null;
  const entry = PAYMENT_LINKS[slug];
  return entry === `/checkout?offer=${slug}` ? entry : null;
}
