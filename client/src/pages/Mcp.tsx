import { useEffect } from "react";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { track } from "../lib/posthog";
import styles from "./Mcp.module.css";

const SMITHERY_URL = "https://smithery.ai/servers/epistemedeus/x402-data-gateway";
const GATEWAY_URL = "https://agents.samedaydesk.com";
const DEMO_URL = "https://youtu.be/QTsTs_ZjwNo";
const TASKMARKET_URL = "https://taskmarket.dev";
const TASKMARKET_SOURCE = "https://github.com/epistemedeus/samedaydesk/blob/main/TASKMARKET-INTEGRATION.md";
const CENSUS_URL = "/research/agent402-base-seller-protocol-census-2026-08-09.json";
const SELLER_DIAGNOSTIC_EMAIL = "mailto:contact@samedaydesk.com?subject=Agent%20payment%20readiness%20diagnostic&body=Origin%20URL%3A%0AWhat%20you%20want%20to%20verify%3A%0A";
const SELLER_INTEGRATION_EMAIL = "mailto:contact@samedaydesk.com?subject=Production%20x402%20and%20MPP%20integration&body=Origin%20URL%3A%0APaid%20routes%3A%0ARuntime%20or%20repository%20details%3A%0A";

const tools = [
  {
    name: "extract",
    price: "$0.05",
    description: "Turn a public URL into structured page data, including JSON-LD, social metadata, headings, links, and AI readiness signals.",
  },
  {
    name: "read",
    price: "$0.05",
    description: "Return a public page as clean Markdown with navigation, ads, and scripts removed.",
  },
  {
    name: "scan",
    price: "$0.20",
    description: "Statically scan a public GitHub repository for credential reads, exfiltration sinks, obfuscation, and unsafe install hooks.",
  },
  {
    name: "schemaforge",
    price: "$0.25",
    description: "Generate a paste-ready JSON-LD bundle, a live-site gap analysis, and a ranked structured-data fix list.",
  },
  {
    name: "enrich",
    price: "$0.05",
    description: "Build a company profile from a domain, including identity, technology, contacts, DNS, email infrastructure, and AI readiness.",
  },
  {
    name: "wallet_enrich",
    price: "$0.05",
    description: "Profile a Base or EVM address using public on-chain data, token metadata, activity, proxy detection, and a derived label.",
  },
  {
    name: "deep_audit",
    price: "$0.25",
    description: "Combine company enrichment, AI-search scoring, structured-data gaps, and a paste-ready fix list in one report.",
  },
  {
    name: "morpho_position",
    price: "$0.02",
    description: "Normalize active Morpho positions on Base, calculate LTV and liquidation headroom, run price shocks, and cross-check indexed state against direct RPC.",
  },
  {
    name: "morpho_protection",
    price: "$0.10",
    description: "Calculate the partial repay or added collateral needed to withstand a chosen price shock, then return unsigned approval and Morpho call templates with explicit invariants.",
  },
  {
    name: "morpho_market_underwrite",
    price: "$0.25",
    description: "Cross-check a Base Morpho market across canonical API, REST, and direct RPC, then expose liquidity, utilization, APY history, borrower concentration, health bands, bad debt, and PreLiquidation supply as separate evidence flags.",
  },
  {
    name: "morpho_preliquidation_replay",
    price: "$0.10",
    description: "Replay a successful Base PreLiquidation transaction from direct block-state reads, including repaid debt, seized collateral, protocol-oracle gross incentive, gas, and the limits of any net-profit inference.",
  },
  {
    name: "opportunity_preflight",
    price: "$0.05",
    description: "Evaluate a funded agent-work opportunity using explicit reward, time, cost, access, settlement, competition, and selection assumptions before an agent commits effort.",
  },
];

const taskmarketTools = [
  {
    name: "plan_taskmarket_delegation",
    description: "Turn an external-work request into a bounded TaskMarket payload with a separate reward ceiling and an explicit payment checkpoint.",
  },
  {
    name: "browse_taskmarket_tasks",
    description: "Read current public tasks through TaskMarket's official API and filter by status, mode, tag, text, and reward.",
  },
  {
    name: "track_taskmarket_task",
    description: "Track deadline, submissions, artifact hashes, awards, and the next action without accepting or spending automatically.",
  },
];

export default function Mcp() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Agent Payment Infrastructure: x402 and MPP | SameDayDesk";
    const meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta?.getAttribute("content") ?? null;
    meta?.setAttribute(
      "content",
      "Pay-per-call machine tools accepting both x402 and native MPP on Base, plus seller integration, settlement reconciliation, and market integrity evidence. The live manifest is the current list.",
    );

    const params = new URLSearchParams(window.location.search);
    const referrerHost = (() => {
      if (!document.referrer) return "direct";
      try {
        return new URL(document.referrer).hostname;
      } catch {
        return "unknown";
      }
    })();
    track("x402_page_viewed", {
      referrer_host: referrerHost,
      source: params.get("utm_source") || params.get("source") || undefined,
      medium: params.get("utm_medium") || undefined,
      campaign: params.get("utm_campaign") || undefined,
    });

    return () => {
      document.title = previousTitle;
      if (previousDescription !== null) meta?.setAttribute("content", previousDescription);
    };
  }, []);

  function trackAction(action: string, location: string) {
    track("x402_cta_clicked", { action, location });
  }

  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <header className={styles.hero}>
          <p className="eyebrow">Machine commerce · x402 and native MPP on Base</p>
          <h1 className={styles.h1}>
            Agents discover a service, call it, <span className="lime">pay, and continue</span>
          </h1>
          <p className={styles.lead}>
            Deterministic tools for research, security, enrichment, agent-work economics, and Morpho
            decisions. No API key, subscription, or account is required. Every paid HTTP route accepts either x402
            or native MPP, settles the same exact Base USDC amount, and returns a machine-readable result.
          </p>
          <div className={styles.actions}>
            <a
              className={styles.primary}
              href={SMITHERY_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAction("open_smithery", "hero")}
            >
              Open in Smithery →
            </a>
            <a
              className={styles.secondary}
              href="https://github.com/epistemedeus/x402-url-extractor"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAction("view_source", "hero")}
            >
              View source
            </a>
            <a
              className={styles.secondary}
              href={DEMO_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAction("watch_demo", "hero")}
            >
              Watch 2-minute demo
            </a>
            <a
              className={styles.secondary}
              href="/docs/x402-sdk/"
              onClick={() => trackAction("read_sdk_docs", "hero")}
            >
              Read SDK docs
            </a>
          </div>
          <a
            className={styles.badge}
            href={SMITHERY_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackAction("open_smithery", "badge")}
          >
            <span aria-hidden>◆</span> Listed on Smithery
          </a>
        </header>

        <section className={styles.section} aria-labelledby="tools-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Available tools</p>
            <h2 id="tools-title">Focused calls, from $0.02</h2>
          </div>
          <div className={styles.grid}>
            {tools.map((tool) => (
              <article className={styles.card} key={tool.name}>
                <div className={styles.cardTop}>
                  <code>{tool.name}</code>
                  <span>{tool.price} USDC</span>
                </div>
                <p>{tool.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.sellerOffer} aria-labelledby="seller-title">
          <div>
            <p className="eyebrow">For x402 sellers</p>
            <h2 id="seller-title">Find the payment failures your catalog cannot see</h2>
            <p>
              A public listing does not prove that price, request binding, settlement, delivery, and receipts still
              agree at runtime. We compare your live origin with Agent402, Coinbase Bazaar, and MPP discovery, then
              return the exact drift and production work that remains. No credentials or payment signing are needed.
            </p>
            <div className={styles.actions}>
              <a
                className={styles.primary}
                href={SELLER_DIAGNOSTIC_EMAIL}
                onClick={() => trackAction("request_payment_readiness_diagnostic", "seller_offer")}
              >
                Request a 48-hour diagnostic · $99
              </a>
              <a
                className={styles.secondary}
                href={SELLER_INTEGRATION_EMAIL}
                onClick={() => trackAction("request_dual_stack_integration", "seller_offer")}
              >
                Request production implementation · $299
              </a>
              <a
                className={styles.secondary}
                href="https://github.com/epistemedeus/x402-url-extractor/blob/master/mpp-dual-stack.mjs"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackAction("view_mpp_middleware", "seller_offer")}
              >
                Inspect production middleware
              </a>
            </div>
          </div>
          <div className={styles.offerCard}>
            <span>Readiness diagnostic</span>
            <ul>
              <li>One public origin and its paid route inventory</li>
              <li>Live origin versus Agent402, Bazaar, and MPP discovery</li>
              <li>Price, recipient, schema, and request-binding conflicts</li>
              <li>Settlement, receipt, replay, and reconciliation gaps</li>
              <li>Fixed-scope eligibility and a route-level action plan</li>
              <li>No wallet access, credentials, or signed payments</li>
            </ul>
            <p>
              Fixed $99, credited in full toward a compatible $299 implementation within 14 days. The founding
              implementation covers up to ten existing Express GET routes, deployment review, and one revision.
            </p>
          </div>
        </section>

        <section className={styles.marketEvidence} aria-labelledby="evidence-title">
          <div>
            <p className="eyebrow">Measured market gap · 9 August 2026</p>
            <h2 id="evidence-title">Twenty-four verified external Base routes. Twenty-four x402-only.</h2>
          </div>
          <div>
            <p>
              A bounded credential-free census started from Agent402's live index, selected all 41 healthy HTTPS
              Base sellers in the declared cohort, and tested one indexed paid GET route per seller. Twenty-four
              routes returned a valid runtime payment challenge; all twenty-four offered x402 and none offered
              native MPP. The SameDayDesk routes offer both.
            </p>
            <a
              className={styles.inlineLink}
              href={CENSUS_URL}
              onClick={() => trackAction("open_agent402_census", "market_evidence")}
            >
              Read the public methodology and aggregate result →
            </a>
          </div>
        </section>

        <section className={styles.delegation} aria-labelledby="delegation-title">
          <div className={styles.delegationIntro}>
            <p className="eyebrow">TaskMarket delegation bridge</p>
            <h2 id="delegation-title">Delegate outside work without giving the server a wallet</h2>
            <p>
              The free SameDayDesk MCP integration helps an agent scope external work, inspect the live
              TaskMarket, and track the result. Creation, funding, and acceptance stay in TaskMarket's
              official flow as separate, visible user-authorized actions.
            </p>
            <ol className={styles.flow}>
              <li>Define the deliverable, deadline, reward, and maximum spend.</li>
              <li>Review the exact TaskMarket payload before any x402 payment.</li>
              <li>Track submissions and settlement evidence without automatic acceptance.</li>
            </ol>
            <div className={styles.actions}>
              <a
                className={styles.primary}
                href={TASKMARKET_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackAction("open_taskmarket", "delegation")}
              >
                Open TaskMarket →
              </a>
              <a
                className={styles.secondary}
                href={TASKMARKET_SOURCE}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackAction("view_taskmarket_source", "delegation")}
              >
                Read implementation and safety model
              </a>
            </div>
          </div>
          <div className={styles.taskmarketGrid}>
            {taskmarketTools.map((tool) => (
              <article className={styles.taskmarketCard} key={tool.name}>
                <code>{tool.name}</code>
                <p>{tool.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.connect} aria-labelledby="connect-title">
          <div>
            <p className="eyebrow">Connect</p>
            <h2 id="connect-title">Use Smithery or connect directly</h2>
            <p>
              Smithery provides a managed connection. MCP clients that support Streamable HTTP can
              connect to the durable public endpoint directly and discover the current schemas.
            </p>
          </div>
          <div className={styles.commands}>
            <div>
              <span>Smithery</span>
              <code>smithery mcp add epistemedeus/x402-data-gateway</code>
            </div>
            <div>
              <span>Streamable HTTP</span>
              <code>{GATEWAY_URL}/mcp</code>
            </div>
            <div>
              <span>x402 resource manifest</span>
              <a
                href={`${GATEWAY_URL}/.well-known/x402`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackAction("inspect_manifest", "connect")}
              >
                {GATEWAY_URL}/.well-known/x402
              </a>
            </div>
            <div>
              <span>x402 integration reference</span>
              <a
                href="/docs/x402-sdk/"
                onClick={() => trackAction("read_sdk_docs", "connect")}
              >
                samedaydesk.com/docs/x402-sdk/
              </a>
            </div>
          </div>
        </section>

        <section className={styles.note} aria-labelledby="payment-title">
          <div>
            <p className="eyebrow">Payment</p>
            <h2 id="payment-title">Machine-readable pricing, no prepaid balance</h2>
          </div>
          <p>
            An unpaid request returns both the extension-rich x402 requirements and a native MPP Payment challenge.
            A compatible client selects one protocol, authorizes the exact USDC amount, retries the call, and receives
            the result plus its protocol receipt. Pricing and the recipient address remain identical across both
            paths. You can inspect a real unpaid challenge without connecting a wallet or spending anything.
            {" "}
            <a
              className={styles.inlineLink}
              href={`${GATEWAY_URL}/enrich?domain=stripe.com`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAction("inspect_402_challenge", "payment")}
            >
              See the live 402 response →
            </a>
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
