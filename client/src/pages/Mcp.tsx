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
    document.title = "x402 Data Gateway MCP Server | SameDayDesk";
    const meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta?.getAttribute("content") ?? null;
    meta?.setAttribute(
      "content",
      "Nine pay-per-call machine tools for deterministic data, Morpho position risk, and unsigned protection plans, plus free TaskMarket delegation helpers.",
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
          <p className="eyebrow">Machine commerce · MCP, A2A, and x402 on Base</p>
          <h1 className={styles.h1}>
            Agents discover a service, call it, <span className="lime">pay, and continue</span>
          </h1>
          <p className={styles.lead}>
            Nine deterministic tools for research, security, enrichment, Morpho position risk, and
            unsigned protection planning. No API key, subscription, or account is required. Each
            successful paid call settles USDC on Base through x402 and returns a machine-readable result.
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
            <h2 id="tools-title">Nine focused calls, from $0.02</h2>
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
              connect to the durable public endpoint directly and discover all nine current schemas.
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
            An unpaid request returns the x402 payment requirements. A compatible client signs the exact
            USDC amount, retries the call, and receives the result. Pricing and the recipient address are
            published in the live resource manifest. You can inspect a real unpaid challenge without
            connecting a wallet or spending anything.
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
