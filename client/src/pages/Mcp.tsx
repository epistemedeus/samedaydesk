import { useEffect } from "react";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { track } from "../lib/posthog";
import styles from "./Mcp.module.css";

const SMITHERY_URL = "https://smithery.ai/servers/epistemedeus/x402-data-gateway";
const GATEWAY_URL = "https://x402-url-extractor-production.up.railway.app";
const DEMO_URL = "https://youtu.be/QTsTs_ZjwNo";

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
    price: "$0.02",
    description: "Build a company profile from a domain, including identity, technology, contacts, DNS, email infrastructure, and AI readiness.",
  },
  {
    name: "wallet_enrich",
    price: "$0.02",
    description: "Profile a Base or EVM address using public on-chain data, token metadata, activity, proxy detection, and a derived label.",
  },
  {
    name: "deep_audit",
    price: "$0.25",
    description: "Combine company enrichment, AI-search scoring, structured-data gaps, and a paste-ready fix list in one report.",
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
      "Seven pay-per-call MCP tools for URL extraction, Markdown reading, repository security scans, company and wallet enrichment, structured data, and AI-search audits. Pay in USDC on Base through x402.",
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
          <p className="eyebrow">Remote MCP server · x402 on Base</p>
          <h1 className={styles.h1}>
            Useful data tools that agents can <span className="lime">pay for per call</span>
          </h1>
          <p className={styles.lead}>
            Seven remote tools for research, security, enrichment, and AI-search work. No API key,
            subscription, or account is required. Each successful call settles USDC on Base through
            the x402 protocol.
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
            <h2 id="tools-title">Seven focused calls, from $0.02</h2>
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

        <section className={styles.connect} aria-labelledby="connect-title">
          <div>
            <p className="eyebrow">Connect</p>
            <h2 id="connect-title">Use Smithery or connect directly</h2>
            <p>
              Smithery provides a managed connection and discovered all seven tool schemas. MCP clients
              that support Streamable HTTP can also connect to the public endpoint directly.
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
