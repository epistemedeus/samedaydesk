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
  /** One line showing it happen to one of their customers. */
  example: string;
  /** What the buyer receives, in plain words. */
  receive: string[];
  /** Ordered by a prepared email when there is no payment link. */
  mailto?: string;
  turnaround: string;
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
        outcome: "One task your team repeats, done by an AI assistant from start to finish.",
        example: "New orders go from your inbox to your spreadsheet and a reply goes out, with nobody copying and pasting.",
        receive: [
          "The job running on its own",
          "A live demo you can try",
          "The code, yours to keep",
          "Setup notes for your team",
        ],
        name: "Agent Workflow Integration",
        price: 149,
        turnaround: "Same day",
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
        outcome: "People use your service by asking their AI assistant.",
        example: "A customer types \"book me a table for Friday\" into Claude and your booking system takes it.",
        receive: [
          "Your service, usable from ChatGPT and Claude",
          "Up to five things people can ask it to do",
          "A live connection to try",
          "The code and a setup guide",
        ],
        name: "Agent-Ready MCP Server",
        price: 349,
        turnaround: "1 to 2 days",
        flagship: true,
        blurb: "Turn an existing API into a focused MCP server agents can select and call without guessing the request or response shape.",
        includes: [
          "Up to five focused tools",
          "Typed inputs and structured outputs",
          "Authentication boundary",
          "Streamable HTTP transport",
          "Tests and setup guide",
          "Public or private deployment handoff",
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
        outcome: "AI agents pay you each time they use your service, with no sign-up and no invoice.",
        example: "A research agent pays 5 cents per lookup on your data and the money lands in your account.",
        receive: [
          "Pay-per-use on one part of your service",
          "Payments in digital dollars, straight to you",
          "A receipt for every payment",
          "Tests that prove it works",
        ],
        name: "x402 + MPP Payment Route",
        price: 499,
        turnaround: "2 to 3 days",
        blurb: "Make one existing API operation machine-payable with exact Base USDC terms, dual-rail negotiation, and settlement evidence.",
        includes: [
          "One existing GET or POST operation",
          "x402 and native MPP payment negotiation",
          "Exact asset, amount, recipient, and route binding",
          "Idempotent retry path",
          "Settlement and receipt verification",
          "Deployment tests and handoff",
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
        outcome: "AI shopping assistants can find your products, buy and come back.",
        example: "Someone asks their assistant for a gift under 50 dollars and it buys from you.",
        receive: [
          "Up to five things agents can buy",
          "Listings AI assistants can find",
          "Payments that settle to you",
          "A guide to run it yourself",
        ],
        name: "Agent Commerce Storefront",
        price: 999,
        turnaround: "3 to 5 days",
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
        turnaround: "1 to 2 days",
        outcome: "A single sentence your customers give their AI, and it knows how to use you.",
        example: "You print one line on your site; a visitor pastes it into ChatGPT and gets served.",
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
        mailto: "mailto:contact@samedaydesk.com?subject=Agent%20Front%20Door&body=My%20site%3A%20%0AThe%20one%20thing%20a%20customer%27s%20AI%20should%20do%20there%3A%20",
      },
      {
        slug: "keep_it_working",
        plain: "Keep it working",
        name: "Monthly care",
        price: 100,
        per: "/mo",
        turnaround: "Monthly",
        outcome: "We watch it, test it after every change and fix it when it breaks.",
        example: "An update on your side breaks the payment step; we catch it the same day and fix it.",
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
        mailto: "mailto:contact@samedaydesk.com?subject=Keep%20it%20working&body=What%20should%20we%20keep%20working%3F%20",
      },
    ],
  },
];

export const CUSTOM = {
  slug: "custom_quote",
  name: "A harder agent-commerce problem?",
  blurb: "Tell us what must work. You get a written scope and a fixed quote before any work starts.",
};

export const ALL_OFFERS: Offer[] = CATEGORIES.flatMap((category) => category.offers);
export const flagship = ALL_OFFERS.find((offer) => offer.flagship)!;

// Live Stripe Payment Links are inserted only after the matching product,
// price, and metadata have been verified in the live Stripe account.
export const PAYMENT_LINKS: Record<string, string> = {
  agent_workflow: "https://buy.stripe.com/7sY3cw8025np9dd282eZ20B",
  agent_mcp_server: "https://buy.stripe.com/eVq7sMdkmaHJ1KL6oieZ20C",
  machine_payment_route: "https://buy.stripe.com/eVqfZibce2bd2OP7smeZ20D",
  agent_storefront: "https://buy.stripe.com/dRm4gAdkmbLN4WX7smeZ20E",
  custom_quote: "https://buy.stripe.com/bJe4gAbcedTV8993c6eZ205",
};
