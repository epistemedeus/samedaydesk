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
const MANIFEST_URL = `${GATEWAY_URL}/.well-known/x402`;

const tools = [
  {
    name: "extract",
    price: "$0.005",
    description: "Turn a public URL into structured page data, including JSON-LD, social metadata, headings, links, and AI readiness signals.",
  },
  {
    name: "read",
    price: "$0.005",
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
  {
    name: "agent_discoverability_audit",
    price: "$0.05",
    description: "Compare one paid service across public discovery views, canonical aliases, live offer terms, prices, and machine-surface coverage without signing or paying.",
  },
  {
    name: "payment_offer_preflight",
    price: "$0.005",
    description: "Compare live x402 and MPP challenges, catalog metadata, request binding, and seller-declared response readiness before buyer authorization.",
  },
  {
    name: "settlement_proof",
    price: "$0.005",
    description: "Verify one claimed Base USDC settlement against the finalized on-chain receipt, exact recipient, amount, and optional payer.",
  },
  {
    name: "transaction_receipt",
    price: "$0.002",
    description: "Normalize a Base or Ethereum transaction receipt, gas, fees, ERC-20 transfers, and canonical USDC movements from one hash.",
  },
  {
    name: "solana_transaction_receipt",
    price: "$0.002",
    description: "Normalize a finalized Solana transaction and optionally verify exact SPL-token mint, recipient, amount, and payer deltas.",
  },
  {
    name: "wallet_policy_conformance",
    price: "$0.01",
    description: "Evaluate a credential-free allow and deny matrix for an agent wallet or delegated signer without accepting wallet IDs or transactions.",
  },
  {
    name: "stateful_wallet_policy_conformance",
    price: "$0.01",
    description: "Evaluate sequential limits, signed-but-unbroadcast accounting, concurrency, and serialization policy observations without wallet access.",
  },
  {
    name: "seller_integrity_audit",
    price: "$0.01",
    description: "Audit one paid GET or POST route for constructible input, live unpaid terms, catalog parity, and recursively guaranteed success fields.",
  },
  {
    name: "contract_qualified_search",
    price: "$0.01",
    description: "Search Agent402 and MPP for services matching an intent and buyer-required JSON paths, with controlled rejection reasons.",
  },
  {
    name: "agent_surface_budget_audit",
    price: "$0.01",
    description: "Measure MCP and OpenAPI discovery bytes, selection contracts, heavy definitions, and progressive-discovery fixes before a call or payment.",
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

function MachineName({ name }: { name: string }) {
  const parts = name.split("_");
  return (
    <>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {index > 0 && "_"}
          {part}
          {index < parts.length - 1 && <wbr />}
        </span>
      ))}
    </>
  );
}

export default function Mcp() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Agent Payment Infrastructure: x402 and MPP | SameDayDesk";
    const meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta?.getAttribute("content") ?? null;
    meta?.setAttribute(
      "content",
      "Twenty-two pay-per-call machine tools accepting both x402 and native MPP on Base, plus one alternate x402-only Circle Gateway route.",
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
            Twenty-two deterministic tools for discovery, purchase safety, settlement evidence, security, research,
            and DeFi decisions. No API key, subscription, or account is required. Every canonical paid action accepts
            either x402 or native MPP, settles the same exact Base USDC amount, and returns a machine-readable result.
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
            <h2 id="tools-title">Twenty-two focused calls, from $0.002</h2>
          </div>
          <div className={styles.grid}>
            {tools.map((tool) => (
              <article className={styles.card} key={tool.name}>
                <div className={styles.cardTop}>
                  <code><MachineName name={tool.name} /></code>
                  <span>{tool.price} USDC</span>
                </div>
                <p>{tool.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.sellerOffer} aria-labelledby="seller-title">
          <div>
            <p className="eyebrow">Machine purchase gates</p>
            <h2 id="seller-title">Inspect before an agent authorizes payment</h2>
            <p>
              Discovery is not authorization. These live tools check whether a buyer can construct the request,
              inspect exact payment terms, verify the promised output contract, and reconcile a settlement. They use
              no target credentials, wallet signing, or target payment during inspection.
            </p>
            <div className={styles.actions}>
              <a
                className={styles.primary}
                href={`${GATEWAY_URL}/commerce/seller-integrity-audit?method=GET&origin=https%3A%2F%2Fagents.samedaydesk.com&requireBazaar=true&requiredPaths=decision%2Coffers&route=%2Fcommerce%2Fpayment-offer-preflight`}
                onClick={() => trackAction("inspect_seller_integrity_audit", "seller_offer")}
              >
                Inspect the seller audit · $0.01
              </a>
              <a
                className={styles.secondary}
                href={`${GATEWAY_URL}/commerce/contract-qualified-search?limit=5&maxPriceDisplayUnits=0.1&query=service+domain+ownership+code+provenance&requiredPaths=data.sourceRepository`}
                onClick={() => trackAction("inspect_contract_qualified_search", "seller_offer")}
              >
                Inspect qualified search · $0.01
              </a>
              <a
                className={styles.secondary}
                href="mailto:contact@samedaydesk.com?subject=Agent%20payment%20infrastructure%20build&body=Origin%20or%20repository%3A%0AWhat%20must%20work%3A%0A"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackAction("request_agent_payment_build", "seller_offer")}
              >
                Bring us the hard part
              </a>
            </div>
          </div>
          <div className={styles.offerCard}>
            <span>Exact-operation evidence</span>
            <ul>
              <li>Constructible required input</li>
              <li>Exact route, method, price, asset, and recipient</li>
              <li>Buyer-required success paths</li>
              <li>Settlement and receipt verification</li>
              <li>Privacy-bounded evidence</li>
              <li>No target credentials, signature, or payment</li>
            </ul>
            <p>
              Seller declarations help a buyer plan. They do not replace runtime validation, settlement evidence,
              or buyer authorization.
            </p>
          </div>
        </section>

        <section className={styles.marketEvidence} aria-labelledby="evidence-title">
          <div>
            <p className="eyebrow">Live storefront contract</p>
            <h2 id="evidence-title">Twenty-two canonical actions. Two payment protocols.</h2>
          </div>
          <div>
            <p>
              The live catalog, x402 manifest, MPP OpenAPI, MCP tools, and A2A card describe the same twenty-two
              canonical actions. The x402 manifest also carries one Circle Gateway alternate for payment preflight;
              it is an alternate access path, not a twenty-third dual-rail product.
            </p>
            <a
              className={styles.inlineLink}
              href={MANIFEST_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAction("inspect_manifest", "market_evidence")}
            >
              Inspect the live manifest →
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
                <code><MachineName name={tool.name} /></code>
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
              connect to the durable public endpoint directly and discover all twenty-two current tools.
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
