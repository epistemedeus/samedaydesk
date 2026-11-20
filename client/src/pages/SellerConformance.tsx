import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import {
  findSellerRepairBrief,
  sellerRepairBriefs,
  sellerRepairBriefUrl,
} from "../data/sellerRepairBriefs";
import {
  findSellerResolvedCase,
  sellerResolvedCaseUrl,
  sellerResolvedCases,
} from "../data/sellerResolvedCases";
import { track } from "../lib/posthog";
import { sellerConformanceCheckout, sellerRepairFixedScopeUrl } from "../lib/sellerRepairHandoff";
import styles from "./SellerConformance.module.css";

const PAGE_TITLE = "Seller audit: get paid by AI agents | SameDayDesk";
const PAGE_DESCRIPTION =
  "We call your paid endpoint the way a buying AI agent does and show you what to fix. Live audit 0.01 USDC; one-route report 490 USD. Agent402 bought one audit and repaired 557 routes.";
const PAGE_URL = "https://samedaydesk.com/x402/seller-conformance";
const ACTION_SHA = "ef519956505b195454aa670230b0936258b451fb";
const MERGE_SHA = "086163e979b6a91a73a8eb82664336ae6dbc5473";
const ACTION_PIN = `epistemedeus/agent-payment-integrity@${ACTION_SHA}`;
const MARKETPLACE_URL = "https://github.com/marketplace/actions/agent-payment-integrity";
const INTEGRITY_REPO_URL = "https://github.com/epistemedeus/agent-payment-integrity";
const POLICY_REPO_URL = "https://github.com/epistemedeus/agent-payment-policy";
const LIVE_AUDIT_URL =
  "https://agents.samedaydesk.com/commerce/seller-integrity-audit?method=GET&origin=https%3A%2F%2Fagents.samedaydesk.com&requireBazaar=true&requiredPaths=decision%2Coffers&route=%2Fcommerce%2Fpayment-offer-preflight";
const AGENT402_PR_URL = "https://github.com/MikeyPetrillo/Agent402/pull/947";
const AGENT402_CUSTOMER_ISSUE_URL = "https://github.com/MikeyPetrillo/Agent402/issues/1047";
const AGENT402_BUYER_GUARD_PR_URL = "https://github.com/MikeyPetrillo/Agent402/pull/1052";
const AGENT402_DEPLOYED_REPAIR_PR_URL = "https://github.com/MikeyPetrillo/Agent402/pull/1060";
const VALIDATION_RECEIPT_URL =
  "/research/agent402-seller-integrity-validation-2026-08-29.json";

function restoreAttribute(el: Element | null, attribute: string, previous: string | null) {
  if (previous !== null) el?.setAttribute(attribute, previous);
}

export default function SellerConformance() {
  const [searchParams] = useSearchParams();
  const selectedBrief = findSellerRepairBrief(searchParams.get("finding"));
  const selectedResolved = findSellerResolvedCase(searchParams.get("resolved"));
  const checkoutReturned = searchParams.get("checkout") === "returned" && selectedBrief !== null;
  const pageTitle = selectedBrief
    ? `${selectedBrief.seller} repair brief | SameDayDesk`
    : selectedResolved
      ? `${selectedResolved.seller} resolved diagnostic | SameDayDesk`
      : PAGE_TITLE;
  const pageDescription = selectedBrief
    ? `${selectedBrief.seller}: inspect one credential-free finding for ${selectedBrief.method} ${selectedBrief.route}, the exact repair boundary, and the fixed one-route scope.`
    : selectedResolved
      ? `${selectedResolved.seller}: inspect one resolved diagnostic for ${selectedResolved.method} ${selectedResolved.route}, repaired in the open.`
      : PAGE_DESCRIPTION;
  const pageUrl = selectedBrief
    ? sellerRepairBriefUrl(selectedBrief.id)
    : selectedResolved
      ? sellerResolvedCaseUrl(selectedResolved.id)
      : PAGE_URL;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = pageTitle;

    const description = document.querySelector('meta[name="description"]');
    const canonical = document.querySelector('link[rel="canonical"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');

    const previousDescription = description?.getAttribute("content") ?? null;
    const previousCanonical = canonical?.getAttribute("href") ?? null;
    const previousOgUrl = ogUrl?.getAttribute("content") ?? null;
    const previousOgTitle = ogTitle?.getAttribute("content") ?? null;
    const previousOgDescription = ogDescription?.getAttribute("content") ?? null;
    const previousTwitterTitle = twitterTitle?.getAttribute("content") ?? null;
    const previousTwitterDescription = twitterDescription?.getAttribute("content") ?? null;

    description?.setAttribute("content", pageDescription);
    canonical?.setAttribute("href", pageUrl);
    ogUrl?.setAttribute("content", pageUrl);
    ogTitle?.setAttribute("content", pageTitle);
    ogDescription?.setAttribute("content", pageDescription);
    twitterTitle?.setAttribute("content", pageTitle);
    twitterDescription?.setAttribute("content", pageDescription);

    return () => {
      document.title = previousTitle;
      restoreAttribute(description, "content", previousDescription);
      restoreAttribute(canonical, "href", previousCanonical);
      restoreAttribute(ogUrl, "content", previousOgUrl);
      restoreAttribute(ogTitle, "content", previousOgTitle);
      restoreAttribute(ogDescription, "content", previousOgDescription);
      restoreAttribute(twitterTitle, "content", previousTwitterTitle);
      restoreAttribute(twitterDescription, "content", previousTwitterDescription);
    };
  }, [pageDescription, pageTitle, pageUrl]);

  useEffect(() => {
    if (!selectedBrief) return;
    track("seller_repair_brief_viewed", {
      finding_id: selectedBrief.id,
      route_class: selectedBrief.routeClass,
    });
  }, [selectedBrief]);

  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <header className={styles.hero}>
          <p className="eyebrow">Seller audit · paid endpoints · x402</p>
          <h1 className={styles.h1}>
            Find out why AI agents can&apos;t pay you, <span className="lime">and fix it</span>
          </h1>
          <p className={styles.lead}>
            We call your paid endpoint the way a buying agent does, read the payment terms it gets
            back, and show you what to change. The live audit is 0.01 USDC a call. A written
            report for one public route, with the recommended fixes, is 490 USD.
          </p>
          <div className={styles.actions}>
            <a
              className={styles.primary}
              href={LIVE_AUDIT_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Run the live audit
            </a>
            <a
              className={styles.secondary}
              href={sellerConformanceCheckout(null)}
            >
              Buy the one-route report · 490 USD
            </a>
          </div>
        </header>

        {selectedBrief ? (
          <section className={styles.repairBrief} aria-labelledby="repair-brief-title">
            {checkoutReturned ? (
              <div className={styles.handoff} role="status">
                <strong>Checkout returned.</strong> Stripe&apos;s signed webhook is the payment
                authority. Watch for confirmation by email, then send repository access if needed.
              </div>
            ) : null}
            <div className={styles.briefHead}>
              <div>
                <p className="eyebrow">Exact public repair brief · {selectedBrief.id}</p>
                <h2 id="repair-brief-title">{selectedBrief.seller}</h2>
              </div>
              <dl className={styles.briefMeta}>
                <div>
                  <dt>Observed</dt>
                  <dd>{selectedBrief.observedAt}</dd>
                </div>
                <div>
                  <dt>Route</dt>
                  <dd><code>{selectedBrief.method} {selectedBrief.route}</code></dd>
                </div>
                <div>
                  <dt>Live offer</dt>
                  <dd>{selectedBrief.livePrice}</dd>
                </div>
              </dl>
            </div>
            <p className={styles.prose}>{selectedBrief.summary}</p>
            <div className={styles.comparison}>
              <div>
                <h3>Observed contract</h3>
                <ul>
                  {selectedBrief.observedContract.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <h3>Buyer-usable contract</h3>
                <ul>
                  {selectedBrief.requiredContract.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
            <div className={styles.comparison}>
              <div>
                <h3>One-route report · 490 USD</h3>
                <ul>
                  {selectedBrief.scope.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <h3>What the repair covers</h3>
                <ul>
                  {selectedBrief.boundaries.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
            <div className={styles.actions}>
              <a
                className={styles.primary}
                href={sellerConformanceCheckout(selectedBrief.id)}
              >
                Buy the one-route report
              </a>
              <a
                className={styles.secondary}
                href={sellerRepairFixedScopeUrl(selectedBrief.id)}
                onClick={() => track("seller_repair_scope_clicked", {
                  finding_id: selectedBrief.id,
                  route_class: selectedBrief.routeClass,
                })}
              >
                Read the report scope
              </a>
              {selectedBrief.evidence.map((item) => (
                <a
                  className={styles.secondary}
                  href={item.href}
                  key={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {selectedResolved ? (
          <section className={styles.repairBrief} aria-labelledby="resolved-case-title">
            <div className={styles.briefHead}>
              <div>
                <p className="eyebrow">Resolved diagnostic case · {selectedResolved.id}</p>
                <h2 id="resolved-case-title">{selectedResolved.seller}</h2>
              </div>
              <dl className={styles.briefMeta}>
                <div>
                  <dt>Observed</dt>
                  <dd>{selectedResolved.observedAt}</dd>
                </div>
                <div>
                  <dt>Route</dt>
                  <dd><code>{selectedResolved.method} {selectedResolved.route}</code></dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>Repaired</dd>
                </div>
              </dl>
            </div>
            <p className={styles.prose}>{selectedResolved.summary}</p>
            <div className={styles.comparison}>
              <div>
                <h3>What holds</h3>
                <ul>
                  {selectedResolved.facts.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <h3>Good to know</h3>
                <ul>
                  {selectedResolved.distinctions.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
            <div className={styles.offerCard}>
              <span>{selectedResolved.firstStep.label}</span>
              <pre>
                <code>{selectedResolved.firstStep.command}</code>
              </pre>
              <p>{selectedResolved.firstStep.note}</p>
              <span>{selectedResolved.paidFollowOn.product} · {selectedResolved.paidFollowOn.livePrice} live</span>
              <pre>
                <code>{selectedResolved.paidFollowOn.command}</code>
              </pre>
              <p>{selectedResolved.paidFollowOn.note}</p>
            </div>
            <div className={styles.actions}>
              {selectedResolved.evidence.map((item) => (
                <a
                  className={styles.secondary}
                  href={item.href}
                  key={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <section className={styles.section} aria-labelledby="get-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">What you get</p>
            <h2 id="get-title">Every gap a buying agent hits, and the fix for each</h2>
          </div>
          <ol className={styles.flow}>
            <li>The payment terms your endpoint returns, read back as an agent sees them</li>
            <li>Each gap named: price, asset, network, recipient, the output a buyer can count on</li>
            <li>The exact change for each one, route by route</li>
            <li>A GitHub check that catches drift on every release</li>
            <li>One written report for a public route: 490 USD</li>
          </ol>
        </section>

        <section className={styles.section} aria-labelledby="validation-receipt-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">A customer result</p>
            <h2 id="validation-receipt-title">Agent402 bought one audit, then repaired 557 routes</h2>
          </div>
          <p className={styles.prose}>
            Agent402&apos;s maintainer bought one 0.01-USDC Seller Integrity Audit of an Agent402 route
            with their own x402 client and wallet. The audit found missing guarantees at{" "}
            <code>current</code>, <code>history</code>, and <code>source</code>. Agent402 repaired the
            seller contract, added a guard so buyer checks always state the result they expect, and
            deployed a catalog repair after finding invalid payment challenges on 557 of 560
            production routes.{" "}
            <a href={VALIDATION_RECEIPT_URL}>Payment receipt.</a>{" "}
            <a href={AGENT402_CUSTOMER_ISSUE_URL} target="_blank" rel="noopener noreferrer">
              The customer&apos;s own write-up.
            </a>{" "}
            <a href={AGENT402_BUYER_GUARD_PR_URL} target="_blank" rel="noopener noreferrer">
              The buyer guard.
            </a>{" "}
            <a href={AGENT402_DEPLOYED_REPAIR_PR_URL} target="_blank" rel="noopener noreferrer">
              The deployed catalog repair.
            </a>
          </p>
        </section>

        <section className={styles.section} aria-labelledby="funnel-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">How it works</p>
            <h2 id="funnel-title">Four steps, most of them ours</h2>
          </div>
          <ol className={styles.flow}>
            <li>Send your endpoint or repository</li>
            <li>We call it as a buying agent would and read the 402 terms</li>
            <li>You get the findings and the fix, route by route</li>
            <li>Add the check so every release is tested</li>
          </ol>
        </section>

        <section className={styles.section} aria-labelledby="brief-index-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Published findings</p>
            <h2 id="brief-index-title">Live sellers we audited</h2>
          </div>
          <p className={styles.prose}>
            Each finding names one route, what a buying agent sees there and the fix. Open one to
            order a written report at a fixed 490 USD.
          </p>
          <ul className={styles.briefIndex}>
            {sellerRepairBriefs.map((brief) => (
              <li key={brief.id}>
                <a href={sellerRepairBriefUrl(brief.id)}>
                  <strong>{brief.seller}</strong>
                  <span><code>{brief.method} {brief.route}</code> · observed {brief.observedAt}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="resolved-index-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Fixed in the open</p>
            <h2 id="resolved-index-title">Sellers who shipped the fix</h2>
          </div>
          <ul className={styles.briefIndex}>
            {sellerResolvedCases.map((item) => (
              <li key={item.id}>
                <a href={sellerResolvedCaseUrl(item.id)}>
                  <strong>{item.seller}</strong>
                  <span><code>{item.method} {item.route}</code> · resolved {item.observedAt}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.sellerOffer} aria-labelledby="pin-title">
          <div>
            <p className="eyebrow">Check every release</p>
            <h2 id="pin-title">One line in your GitHub workflow</h2>
            <p>
              The Agent Payment Integrity Action reads your payment terms on every release and fails
              the build when they drift from what buying agents need. Pin the commit shown here.
            </p>
            <p>
              It follows agent-payment-policy 0.15.1. Agent402 merged the same contract check
              upstream (commit {MERGE_SHA}).
            </p>
          </div>
          <div className={styles.offerCard}>
            <span>Add to your workflow</span>
            <pre>
              <code>{`uses: ${ACTION_PIN}`}</code>
            </pre>
            <p>
              <a href={MARKETPLACE_URL} target="_blank" rel="noopener noreferrer">Marketplace listing</a>
              {" · "}
              <a href={INTEGRITY_REPO_URL} target="_blank" rel="noopener noreferrer">Source</a>
              {" · "}
              <a href={POLICY_REPO_URL} target="_blank" rel="noopener noreferrer">Policy</a>
              {" · "}
              <a href={AGENT402_PR_URL} target="_blank" rel="noopener noreferrer">Agent402 PR 947</a>
            </p>
          </div>
        </section>

        <section className={styles.sellerOffer} aria-labelledby="live-title">
          <div>
            <p className="eyebrow">Try it now</p>
            <h2 id="live-title">Run the live audit on our own route</h2>
            <p>
              The audit answers with HTTP 402 and its terms: 0.01 USDC on Base. Any x402 client can
              pay it and receive the decision. It needs nothing from your side: no key, wallet or
              login.
            </p>
            <div className={styles.actions}>
              <a className={styles.primary} href={LIVE_AUDIT_URL} target="_blank" rel="noopener noreferrer">
                Run the live audit
              </a>
              <a className={styles.secondary} href="/x402/verified">
                Routes we checked
              </a>
              <a className={styles.secondary} href={sellerConformanceCheckout(null)}>
                Buy the one-route report · 490 USD
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
