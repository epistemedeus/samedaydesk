import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { track } from "../lib/posthog";
import { applyMachineMetadata, FOR_AGENTS_PATH, X402_SHELL } from "../data/machineEntry.mjs";
import { receiptId, short, tapeDate, useReceiptFeed, type Receipt } from "../lib/receipts";
import { ALL_OFFERS, PAYMENT_LINKS } from "../lib/services";
import styles from "./Mcp.module.css";
import x from "./X402.module.css";

const SMITHERY_URL = "https://smithery.ai/servers/epistemedeus/x402-data-gateway";
const GATEWAY_URL = "https://agents.samedaydesk.com";
const DEMO_URL = "https://youtu.be/QTsTs_ZjwNo";
const TASKMARKET_URL = "https://taskmarket.dev";
const TASKMARKET_SOURCE = "https://github.com/epistemedeus/samedaydesk/blob/main/TASKMARKET-INTEGRATION.md";
const QUOTE_URL = `${GATEWAY_URL}/extract?url=https%3A%2F%2Fexample.com`;

type Tool = { name: string; price: string; does: string };
// Every paid tool, grouped by what the agent needs done, with its price in USDC per call.
const board: { need: string; tools: Tool[] }[] = [
  {
    need: "Read the web",
    tools: [
      { name: "extract", price: "0.005", does: "A public page as structured data: title, headings, links, JSON-LD." },
      { name: "read", price: "0.005", does: "A public page as clean Markdown, without navigation or ads." },
      { name: "schemaforge", price: "0.25", does: "Paste-ready structured data for a site, and what it is missing." },
      { name: "scan", price: "0.20", does: "A security read of a public GitHub repository before you install it." },
    ],
  },
  {
    need: "Check a seller before paying",
    tools: [
      { name: "payment_offer_preflight", price: "0.005", does: "Read a seller's payment terms before your agent signs anything." },
      { name: "seller_integrity_audit", price: "0.01", does: "Check that a paid route takes the input it says and returns what it promises." },
      { name: "contract_qualified_search", price: "0.01", does: "Find paid services that return the exact fields you need." },
      { name: "agent_discoverability_audit", price: "0.05", does: "How one paid service appears across directories, with its live terms." },
      { name: "agent_surface_budget_audit", price: "0.01", does: "How much an MCP or OpenAPI surface costs an agent to load." },
      { name: "opportunity_preflight", price: "0.05", does: "Whether a paid task is worth your agent's effort, before it starts." },
    ],
  },
  {
    need: "Check a payment or a wallet",
    tools: [
      { name: "settlement_proof", price: "0.005", does: "Confirm a Base USDC payment arrived as claimed." },
      { name: "transaction_receipt", price: "0.002", does: "One Base or Ethereum transaction, its fees and transfers, in plain fields." },
      { name: "solana_transaction_receipt", price: "0.002", does: "One Solana transaction, with an optional exact-payment check." },
      { name: "wallet_policy_conformance", price: "0.01", does: "Test an agent wallet's allow and deny rules, without wallet access." },
      { name: "stateful_wallet_policy_conformance", price: "0.01", does: "Test spending limits over a sequence of payments." },
    ],
  },
  {
    need: "Company and wallet profiles",
    tools: [
      { name: "enrich", price: "0.05", does: "A company from its domain: identity, technology, contacts, email setup." },
      { name: "wallet_enrich", price: "0.05", does: "A Base or EVM address: activity, tokens, and what kind of wallet it is." },
      { name: "deep_audit", price: "0.25", does: "A company profile, its AI-search readiness and a fix list, in one report." },
    ],
  },
  {
    need: "Lending positions on Base",
    tools: [
      { name: "morpho_position", price: "0.02", does: "A Morpho position's loan-to-value and distance to liquidation, under price shocks." },
      { name: "morpho_protection", price: "0.10", does: "How much to repay or add to survive a given price drop, as unsigned calls." },
      { name: "morpho_market_underwrite", price: "0.25", does: "A Morpho market's liquidity, borrowers, health and bad debt, cross-checked." },
      { name: "morpho_preliquidation_replay", price: "0.10", does: "What a past pre-liquidation repaid, seized and cost, from block state." },
    ],
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

const setup = {
  HTTP: `# 1. Ask. The 402 answer carries the price in the PAYMENT-REQUIRED header (base64 JSON).
curl -i "${QUOTE_URL}"

# 2. Sign a transferWithAuthorization for exactly that amount, then send the same
#    request again with the signed payload (base64 JSON) in PAYMENT-SIGNATURE.
curl -i -H "PAYMENT-SIGNATURE: <signed payload>" "${QUOTE_URL}"

# 3. 200 with the answer. PAYMENT-RESPONSE names the settlement transaction on Base.`,
  TypeScript: `import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.AGENT_KEY as \`0x\${string}\`);
const client = new x402Client()
  .register("eip155:8453", new ExactEvmScheme(signer))
  // Refuse any single price above 5 cents (the SDK's default cap is 1 USD).
  .setSpendControls({ maxAmountPerPayment: "$0.05" });

const pay = wrapFetchWithPayment(fetch, client);
const res = await pay("${QUOTE_URL}");
console.log(await res.json(), res.headers.get("PAYMENT-RESPONSE"));`,
  "MCP config": `{
  "mcpServers": {
    "samedaydesk": { "url": "${GATEWAY_URL}/mcp" }
  }
}

# Or through Smithery:
smithery mcp add epistemedeus/x402-data-gateway`,
} as const;
type SetupTab = keyof typeof setup;

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
  const { entries } = useReceiptFeed();
  const latestPaid = entries.find((r) => r.kind === "settlement");
  useEffect(() => {
    const restoreMetadata = applyMachineMetadata(document, X402_SHELL);

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

    return restoreMetadata;
  }, []);

  function trackAction(action: string, location: string) {
    track("x402_cta_clicked", { action, location });
  }

  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <header className={x.hero}>
          <div>
            <p className="eyebrow">Agent payments · x402</p>
            <h1 className={x.h1}>
              Your agent asks, pays a few cents, <span className="lime">and gets the answer</span>
            </h1>
            <p className={styles.lead}>
              Web data and checks your agent can buy one call at a time, in exact USDC on Base. No account, no key,
              no subscription: the price comes back with the first answer, and the agent pays only if it goes on.
            </p>
            <div className={`${styles.actions} ${x.actions}`}>
              <Link className={styles.primary} to={FOR_AGENTS_PATH} onClick={() => trackAction("open_for_agents", "hero")}>
                See what agents buy here →
              </Link>
              <a className={styles.secondary} href="#setup" onClick={() => trackAction("open_setup", "hero")}>Set it up</a>
              <a className={styles.secondary} href={DEMO_URL} target="_blank" rel="noopener noreferrer" onClick={() => trackAction("watch_demo", "hero")}>
                Watch 2-minute demo
              </a>
            </div>
          </div>
          <Sequence />
        </header>

        <CreditsStrip />

        <section className={x.board} aria-labelledby="tools-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Price board</p>
            <h2 id="tools-title">What your agent can buy, priced per call</h2>
          </div>
          <div className={x.groups}>
            {board.map((group) => (
              <section key={group.need} className={x.group} aria-label={group.need}>
                <h3>{group.need}</h3>
                <ul>
                  {group.tools.map((tool) => (
                    <li key={tool.name}>
                      <code><MachineName name={tool.name} /></code>
                      <span className={x.price}>{tool.price} <small>USDC</small></span>
                      <p>{tool.does}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>

        <Quote onTry={() => trackAction("load_live_quote", "quote")} />

        <section className={x.operator} aria-labelledby="operator-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">If you run the agent</p>
            <h2 id="operator-title">You decide what it spends, and you can stop it</h2>
          </div>
          <div className={x.three}>
            <article>
              <h3>Cap what it spends</h3>
              <p>
                Every price arrives before any payment, so the agent's client can refuse one it doesn't like. The x402
                SDK refuses any single payment above 1 USD by default; set your own cap with <code>setSpendControls</code>.
                The wallet you fund is the outer limit: the agent can't spend what isn't in it.
              </p>
            </article>
            <article>
              <h3>See every payment</h3>
              <p>
                Each paid call is one USDC transfer on Base, with its own transaction. Ours are on{" "}
                <Link to="/receipts">the receipts page</Link>, each decoded with a request you can send to check it.
                {latestPaid && <> <Link to={`/receipts/${receiptId(latestPaid)}`}>See the latest paid call.</Link></>}
              </p>
            </article>
            <article>
              <h3>Stop it</h3>
              <p>
                There is nothing to cancel: no account, no subscription, no stored card. Each signed payment covers one
                call and expires within minutes. Move the funds out of the agent's wallet, or remove the tool from its
                configuration, and it stops.
              </p>
            </article>
          </div>
        </section>

        <Setup onCopy={(tab) => trackAction(`copy_setup_${tab.toLowerCase().replace(/\s+/g, "_")}`, "setup")} />

        <section className={styles.sellerOffer} aria-labelledby="seller-title">
          <div>
            <p className="eyebrow">Before your agent pays someone else</p>
            <h2 id="seller-title">Check a seller first</h2>
            <p>
              Before your agent pays another service, it can check that the request can be built, read the exact terms,
              and confirm the answer will have the fields it needs. The check signs nothing and pays the seller nothing.
            </p>
            <div className={styles.actions}>
              <a
                className={styles.primary}
                href={`${GATEWAY_URL}/commerce/seller-integrity-audit?method=GET&origin=https%3A%2F%2Fagents.samedaydesk.com&requireBazaar=true&requiredPaths=decision%2Coffers&route=%2Fcommerce%2Fpayment-offer-preflight`}
                onClick={() => trackAction("inspect_seller_integrity_audit", "seller_offer")}
              >
                Try the seller audit · 0.01 USDC
              </a>
              <a
                className={styles.secondary}
                href={`${GATEWAY_URL}/commerce/contract-qualified-search?limit=5&maxPriceDisplayUnits=0.1&query=service+domain+ownership+code+provenance&requiredPaths=data.sourceRepository`}
                onClick={() => trackAction("inspect_contract_qualified_search", "seller_offer")}
              >
                Try qualified search · 0.01 USDC
              </a>
              <a className={styles.secondary} href="/x402/seller-conformance">Sell to agents yourself</a>
              <a className={styles.secondary} href="/x402/verified">Routes we checked</a>
            </div>
          </div>
          <div className={styles.offerCard}>
            <span>What the check tells your agent</span>
            <ul>
              <li>Whether the request can be built from what it has</li>
              <li>The exact route, method, price, asset and recipient</li>
              <li>Whether the answer will carry the fields it needs</li>
              <li>Whether a payment it made really settled</li>
            </ul>
          </div>
        </section>

        <section className={styles.sellerOffer} aria-labelledby="machine-build-title">
          <div>
            <p className="eyebrow">Make your own service payable</p>
            <h2 id="machine-build-title">Give buying agents a working route</h2>
            <p>We can make one existing API operation payable, or build a storefront for up to five.</p>
            <div className={styles.actions}>
              {ALL_OFFERS.filter(({ slug }) => slug === "machine_payment_route" || slug === "agent_storefront")
                .map(({ slug, price }) => <a className={slug === "machine_payment_route" ? styles.primary : styles.secondary}
                  href={PAYMENT_LINKS[slug]} key={slug}>
                  {slug === "machine_payment_route" ? "Buy a payment route" : "Buy an agent storefront"} · {price} USD
                </a>)}
            </div>
          </div>
          <div className={styles.offerCard}>
            <span>Both builds include</span>
            <ul>
              <li>A request an agent can build and run</li>
              <li>Tests for the payment and receipt</li>
              <li>Instructions to keep it working</li>
            </ul>
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
              <a className={styles.primary} href={TASKMARKET_URL} target="_blank" rel="noopener noreferrer" onClick={() => trackAction("open_taskmarket", "delegation")}>
                Open TaskMarket →
              </a>
              <a className={styles.secondary} href={TASKMARKET_SOURCE} target="_blank" rel="noopener noreferrer" onClick={() => trackAction("view_taskmarket_source", "delegation")}>
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
      </main>
      <Footer />
    </>
  );
}

// The exchange, drawn once on arrival: request, 402 with the price, the paid retry, the answer.
// Each step names the real header it carries. Under reduced motion it is simply drawn.
function Sequence() {
  const steps = [
    { dir: "out", label: "Request", line: "GET /extract?url=…", note: "Any HTTP client, no key" },
    { dir: "in", label: "402 Payment Required", line: "PAYMENT-REQUIRED", note: "0.005 USDC on Base, to the gateway" },
    { dir: "out", label: "Payment", line: "PAYMENT-SIGNATURE", note: "A signed transferWithAuthorization, same request" },
    { dir: "in", label: "200 OK", line: "PAYMENT-RESPONSE", note: "The answer, and the settlement transaction" },
  ];
  return (
    <figure className={x.seq} aria-label="How a paid call works, in four steps">
      <div className={x.lanes} aria-hidden="true"><span>Your agent</span><span>SameDayDesk gateway</span></div>
      <ol>
        {steps.map((s, i) => (
          <li key={s.label} className={x.step} data-dir={s.dir} style={{ "--i": i } as React.CSSProperties}>
            <span className={x.num}>{i + 1}</span>
            <span className={x.arrow} aria-hidden="true" />
            <span className={x.msg}>
              <b>{s.label}</b>
              <code>{s.line}</code>
              <small>{s.note}</small>
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

// A small strip of the latest receipts, linking to all of them.
function CreditsStrip() {
  const { entries, classes } = useReceiptFeed();
  const latest = entries.slice(0, 8);
  const item = (r: Receipt, copy = false) => (
    <li key={`${r.proof}${copy ? "-again" : ""}`} aria-hidden={copy || undefined}>
      <Link to={`/receipts/${receiptId(r)}`} tabIndex={copy ? -1 : undefined}>
        <span>{tapeDate(r.date)}</span>
        {r.kind === "settlement" ? <>{r.tool?.name ?? "paid call"} · {r.amount} · {short(r.chain!.transactionHash)}</> : <>delivered · {r.for}</>}
      </Link>
    </li>
  );
  return (
    <aside className={x.strip} aria-label="Latest receipts">
      <Link to="/receipts" className={x.stripHead}>{classes.paidCalls} paid calls, read from Base <span aria-hidden="true">→</span></Link>
      <div className={x.stripWindow}>
        <ul className={x.stripTrack}>{latest.map((r) => item(r))}{latest.map((r) => item(r, true))}</ul>
      </div>
    </aside>
  );
}

type QuoteResult = {
  requestedAt: string;
  status: number;
  headers: Record<string, string | null>;
  paymentRequired: { accepts?: { scheme: string; network: string; amount: string; asset: string; payTo: string; maxTimeoutSeconds: number }[] } | null;
  body: unknown;
};

// One real unpaid request to the gateway, through the site's fixed same-origin quote route, and
// the challenge it returned, decoded and raw.
function Quote({ onTry }: { onTry: () => void }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "failed">("idle");
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const load = async () => {
    onTry();
    setState("loading");
    try {
      const res = await fetch("/api/x402-quote", { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      setQuote(await res.json());
      setState("done");
    } catch {
      setState("failed");
    }
  };
  const offer = quote?.paymentRequired?.accepts?.[0];
  return (
    <section className={x.quote} aria-labelledby="quote-title">
      <div>
        <p className="eyebrow">See a real price quote</p>
        <h2 id="quote-title">Ask the gateway, without paying</h2>
        <p>
          This sends <code>GET /extract?url=https://example.com</code> to the gateway with no payment and prints what
          comes back: the 402 and its price. Nothing is signed or spent.
        </p>
        <button type="button" className={styles.primary} onClick={load} disabled={state === "loading"}>
          {state === "loading" ? "Asking…" : state === "done" ? "Ask again" : "Ask for a quote"}
        </button>
      </div>
      <div className={x.screen} aria-live="polite">
        {state === "idle" && <p className={x.dim}>The answer appears here.</p>}
        {state === "loading" && <p className={x.dim}>Waiting for the gateway…</p>}
        {state === "failed" && (
          <p>The gateway did not answer just now. You can send the request yourself: <a href={QUOTE_URL} target="_blank" rel="noopener noreferrer">{QUOTE_URL}</a></p>
        )}
        {state === "done" && quote && (
          <>
            <p className={x.statusLine}><b>HTTP {quote.status}</b>{quote.status === 402 ? " Payment Required" : ""}<span>{quote.requestedAt.slice(11, 19)} UTC</span></p>
            {offer ? (
              <dl className={x.offer}>
                <div><dt>Price</dt><dd>{Number(offer.amount) / 1e6} USDC <small>({offer.amount} units)</small></dd></div>
                <div><dt>Scheme</dt><dd>{offer.scheme}</dd></div>
                <div><dt>Network</dt><dd>{offer.network === "eip155:8453" ? "Base" : offer.network} <small>({offer.network})</small></dd></div>
                <div><dt>Pay to</dt><dd className="mono">{offer.payTo}</dd></div>
                <div><dt>Asset</dt><dd className="mono">{offer.asset}</dd></div>
                <div><dt>Signature valid for</dt><dd>{offer.maxTimeoutSeconds} seconds</dd></div>
              </dl>
            ) : <p>No PAYMENT-REQUIRED header came back this time.</p>}
            <details className={x.raw}>
              <summary>PAYMENT-REQUIRED header, decoded</summary>
              <pre>{JSON.stringify(quote.paymentRequired, null, 2)}</pre>
            </details>
            <details className={x.raw}>
              <summary>Response body</summary>
              <pre>{JSON.stringify(quote.body, null, 2)}</pre>
            </details>
          </>
        )}
      </div>
    </section>
  );
}

function Setup({ onCopy }: { onCopy: (tab: string) => void }) {
  const tabs = Object.keys(setup) as SetupTab[];
  const [tab, setTab] = useState<SetupTab>("HTTP");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    onCopy(tab);
    try { await navigator.clipboard.writeText(setup[tab]); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* select by hand */ }
  };
  const move = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    setTab(next);
    document.getElementById(`setup-tab-${next.replace(/\s+/g, "-")}`)?.focus();
  };
  return (
    <section id="setup" className={x.setup} aria-labelledby="setup-title">
      <div className={styles.sectionHead}>
        <p className="eyebrow">Set it up</p>
        <h2 id="setup-title">Three ways in</h2>
      </div>
      <div className={x.tabs} role="tablist" aria-label="Setup">
        {tabs.map((t, i) => (
          <button key={t} id={`setup-tab-${t.replace(/\s+/g, "-")}`} type="button" role="tab" aria-selected={tab === t}
            aria-controls="setup-panel" tabIndex={tab === t ? 0 : -1} onClick={() => { setTab(t); setCopied(false); }} onKeyDown={(e) => move(e, i)}>
            {t}
          </button>
        ))}
        <button type="button" className={x.copy} onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre id="setup-panel" role="tabpanel" aria-labelledby={`setup-tab-${tab.replace(/\s+/g, "-")}`} className={x.code} tabIndex={0}><code>{setup[tab]}</code></pre>
      <p className={x.after}>
        Full reference: <a href="/docs/x402-sdk/">x402 SDK integration notes</a> · <a href={`${GATEWAY_URL}/.well-known/x402`} target="_blank" rel="noopener noreferrer">the gateway's x402 manifest</a> ·{" "}
        <a href="https://github.com/epistemedeus/x402-url-extractor" target="_blank" rel="noopener noreferrer">source</a> · <a href={SMITHERY_URL} target="_blank" rel="noopener noreferrer">Smithery listing</a>
      </p>
    </section>
  );
}
