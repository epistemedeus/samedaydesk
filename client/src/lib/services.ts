// SameDayDesk's human checkout layer. The design stays stable while this small
// catalog tracks the agent-commerce work the desk can actually deliver.
export type Offer = {
  slug: string;
  name: string;
  price: number;
  turnaround: string;
  blurb: string;
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
    tagline: "Bounded, tested, shipped.",
    offers: [
      {
        slug: "agent_workflow",
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
    tagline: "Agents discover, pay, and continue.",
    offers: [
      {
        slug: "machine_payment_route",
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
];

export const CUSTOM = {
  slug: "custom_quote",
  name: "A harder agent-commerce problem?",
  blurb: "Send the constraint, the existing system, and the outcome that must work. You get a bounded scope and a flat quote before we touch production.",
};

export const ALL_OFFERS: Offer[] = CATEGORIES.flatMap((category) => category.offers);
export const flagship = ALL_OFFERS.find((offer) => offer.flagship)!;

// Live Stripe Payment Links are inserted only after the matching product,
// price, and metadata have been verified in the Neomorphic LLC account.
export const PAYMENT_LINKS: Record<string, string> = {
  agent_workflow: "https://buy.stripe.com/7sY3cw8025np9dd282eZ20B",
  agent_mcp_server: "https://buy.stripe.com/eVq7sMdkmaHJ1KL6oieZ20C",
  machine_payment_route: "https://buy.stripe.com/eVqfZibce2bd2OP7smeZ20D",
  agent_storefront: "https://buy.stripe.com/dRm4gAdkmbLN4WX7smeZ20E",
  custom_quote: "https://buy.stripe.com/bJe4gAbcedTV8993c6eZ205",
};
