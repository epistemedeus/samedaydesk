import { useEffect } from "react";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import styles from "./SellerConformance.module.css";

const PAGE_TITLE = "Seller conformance proof | SameDayDesk";
const PAGE_DESCRIPTION =
  "Existing SameDayDesk seller-conformance proof: inspect unpaid 402 terms, pin the integrity Action SHA, and separate release verification from marketplace listing, merged contract projection, deployment, settlement, demand, and revenue.";
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
const VALIDATION_RECEIPT_URL =
  "/research/agent402-seller-integrity-validation-2026-08-29.json";
const CTA_MAILTO =
  "mailto:contact@samedaydesk.com?subject=Existing%20seller%20origin%20or%20repository&body=Existing%20seller%20origin%20or%20repository%3A%0A";

function restoreAttribute(el: Element | null, attribute: string, previous: string | null) {
  if (previous !== null) el?.setAttribute(attribute, previous);
}

export default function SellerConformance() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = PAGE_TITLE;

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

    description?.setAttribute("content", PAGE_DESCRIPTION);
    canonical?.setAttribute("href", PAGE_URL);
    ogUrl?.setAttribute("content", PAGE_URL);
    ogTitle?.setAttribute("content", PAGE_TITLE);
    ogDescription?.setAttribute("content", PAGE_DESCRIPTION);
    twitterTitle?.setAttribute("content", PAGE_TITLE);
    twitterDescription?.setAttribute("content", PAGE_DESCRIPTION);

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
  }, []);

  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <header className={styles.hero}>
          <p className="eyebrow">Inspection · unpaid 402 terms · pinned Action SHA</p>
          <h1 className={styles.h1}>
            Seller-conformance proof is <span className="lime">inspection</span>, not a guarantee
          </h1>
          <p className={styles.lead}>
            Existing SameDayDesk seller-conformance proof: inspect unpaid 402 terms, pin the
            integrity Action SHA, and separate release verification from marketplace listing, merged
            contract projection, deployment, settlement, demand, and revenue. This page is
            human-auditable inspection evidence. It is not a product, certificate, or runtime
            monitor.
          </p>
          <div className={styles.actions}>
            <a
              className={styles.primary}
              href={LIVE_AUDIT_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Inspect the live unpaid 402
            </a>
            <a
              className={styles.secondary}
              href={CTA_MAILTO}
              target="_blank"
              rel="noopener noreferrer"
            >
              Send an existing seller origin or repository
            </a>
          </div>
        </header>

        <section className={styles.section} aria-labelledby="funnel-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Inspection funnel</p>
            <h2 id="funnel-title">Construct, inspect, then authorize separately</h2>
          </div>
          <p className={styles.prose}>
            The funnel is inspection, not a guarantee. A buyer can construct a request, inspect the
            exact unpaid payment terms, verify the buyer-required output, authorize separately,
            validate paid delivery, and reconcile evidence. Authorization, delivery, and settlement
            remain later, separate steps.
          </p>
          <ol className={styles.flow}>
            <li>Construct request</li>
            <li>Inspect exact unpaid payment terms</li>
            <li>Verify buyer-required output</li>
            <li>Authorize separately</li>
            <li>Validate paid delivery</li>
            <li>Reconcile evidence</li>
          </ol>
        </section>

        <section className={styles.sellerOffer} aria-labelledby="pin-title">
          <div>
            <p className="eyebrow">Pinned integrity Action</p>
            <h2 id="pin-title">Pin the exact SHA. Do not use a floating tag.</h2>
            <p>
              Production pin is integrity Action SHA {ACTION_SHA} (Prepare Marketplace-publishable
              0.1.0-candidate.9). Do not use @main or a floating tag as the production pin.
              Marketplace or tag syntax is discovery convenience only. The Action is unpublished on
              npm. Marketplace listing is discovery, not a certification and not an npm release.
            </p>
            <p>
              Policy reference: agent-payment-policy@0.15.1. Seller declarations are planning
              evidence. A passing check does not prove runtime execution, settlement, buyer-valid
              delivery, demand, adoption, or revenue.
            </p>
          </div>
          <div className={styles.offerCard}>
            <span>Exact SHA pin</span>
            <pre>
              <code>{`uses: ${ACTION_PIN}`}</code>
            </pre>
            <p>
              Pin this commit. Marketplace listing and tag names do not replace the SHA.
            </p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="facts-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Separate facts</p>
            <h2 id="facts-title">These are not the same event</h2>
          </div>
          <dl className={styles.facts}>
            <div>
              <dt>Release verification</dt>
              <dd>Unpaid contract check against a pinned Action SHA.</dd>
            </div>
            <div>
              <dt>Marketplace distribution</dt>
              <dd>Public listing exists for discovery.</dd>
            </div>
            <div>
              <dt>Merged adoption</dt>
              <dd>
                Agent402 947 merged contract projection ({MERGE_SHA}).
              </dd>
            </div>
            <div>
              <dt>Deployment</dt>
              <dd>
                Live seller-integrity-audit 402 is reachable on agents.samedaydesk.com.
              </dd>
            </div>
            <div>
              <dt>Independent use</dt>
              <dd>
                The linked receipt proves one externally controlled runtime, recruited for a
                bounded validation. It does not prove organic or unsolicited use.
              </dd>
            </div>
            <div>
              <dt>Settlement</dt>
              <dd>
                The linked receipt proves one 0.01-USDC settlement. The passing unpaid Action
                check alone does not.
              </dd>
            </div>
            <div>
              <dt>Demand</dt>
              <dd>One recruited validation event; organic and repeat demand remain unproved.</dd>
            </div>
            <div>
              <dt>Revenue</dt>
              <dd>One 0.01-USDC external validation receipt; recurring revenue is unproved.</dd>
            </div>
          </dl>
        </section>

        <section className={styles.section} aria-labelledby="validation-receipt-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Bounded evidence</p>
            <h2 id="validation-receipt-title">Agent402 validation receipt</h2>
          </div>
          <p className={styles.prose}>
            This receipt proves only one recruited, non-organic external-runtime settlement and
            delivered result: 0.01 USDC, with no buyer-owned output enforcement, unsolicited
            demand, repeat use, or repair sale. It is not a customer case study.{" "}
            <a href={VALIDATION_RECEIPT_URL}>Read the machine-readable JSON.</a>
          </p>
        </section>

        <section className={styles.sellerOffer} aria-labelledby="live-title">
          <div>
            <p className="eyebrow">Live unpaid audit</p>
            <h2 id="live-title">The live call returns unpaid HTTP 402</h2>
            <p>
              The existing /x402 seller section already prices this live{" "}
              <code>seller-integrity-audit</code> call at 0.01 USDC. That is the only money figure
              on this page. It uses no target credential, target wallet, target signature, seller
              POST, or target payment.
            </p>
            <p>
              Agent402 PR 947 is independent upstream adoption of contract projection, not
              invocation, payment, settlement, or revenue. Maintainer merge commit {MERGE_SHA}.
            </p>
            <div className={styles.actions}>
              <a
                className={styles.secondary}
                href={CTA_MAILTO}
                target="_blank"
                rel="noopener noreferrer"
              >
                Send an existing seller origin or repository
              </a>
            </div>
          </div>
          <div className={styles.offerCard}>
            <span>Direct sources</span>
            <ul>
              <li>
                <a href={MARKETPLACE_URL} target="_blank" rel="noopener noreferrer">
                  Marketplace listing
                </a>
              </li>
              <li>
                <a href={INTEGRITY_REPO_URL} target="_blank" rel="noopener noreferrer">
                  Integrity Action repository
                </a>
              </li>
              <li>
                <a href={POLICY_REPO_URL} target="_blank" rel="noopener noreferrer">
                  agent-payment-policy
                </a>
              </li>
              <li>
                <a href={LIVE_AUDIT_URL} target="_blank" rel="noopener noreferrer">
                  Live seller-integrity-audit
                </a>
              </li>
              <li>
                <a href={AGENT402_PR_URL} target="_blank" rel="noopener noreferrer">
                  Agent402 PR 947
                </a>
                {" · "}
                {MERGE_SHA}
              </li>
            </ul>
            <p>
              Discovery, merge, and a reachable unpaid 402 are separate from settlement, demand, and
              revenue.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
