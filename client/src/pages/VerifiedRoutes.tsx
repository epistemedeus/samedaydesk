import { useEffect, useState } from "react";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import styles from "./VerifiedRoutes.module.css";

const PAGE_TITLE = "Inspected x402 routes | SameDayDesk";
const PAGE_DESCRIPTION =
  "Build-time inspection list of unpaid 402 terms, last check time, contract hash, and whether OpenAPI, the unpaid 402 output schema, and the CDP Bazaar row agree.";
const PAGE_URL = "https://samedaydesk.com/x402/verified";
const FEED_URL = "/x402/verified.json";
const SCHEMA_URL = "/x402/verified.schema.json";

type VerifiedBadge = "verified" | "drift" | "unverified";

type VerifiedRoute = {
  seller: string;
  route: string;
  origin: string;
  method: "GET" | "POST";
  price: {
    amount: string | null;
    display: string;
    asset: string | null;
    network: string | null;
    source: string;
  };
  network: string | null;
  lastVerified: string | null;
  contractHash: string | null;
  agreement: {
    openapi: boolean;
    unpaid402OutputSchema: boolean;
    cdpBazaarRow: boolean;
  };
  badge: VerifiedBadge;
  registryStatus: "green" | "finding" | "alternate";
};

type VerifiedFeed = {
  generatedAt: string;
  qa: { owner: string; label: string };
  limitations: string[];
  routes: VerifiedRoute[];
};

function restoreAttribute(el: Element | null, attribute: string, previous: string | null) {
  if (previous !== null) el?.setAttribute(attribute, previous);
}

function agreeLabel(value: boolean): string {
  return value ? "agree" : "no";
}

export default function VerifiedRoutes() {
  const [feed, setFeed] = useState<VerifiedFeed | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    fetch(FEED_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
        return response.json() as Promise<VerifiedFeed>;
      })
      .then((data) => {
        if (!cancelled) setFeed(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <header className={styles.hero}>
          <p className="eyebrow">Inspection list · unpaid 402 terms · owner QA internal</p>
          <h1 className={styles.h1}>
            Inspected routes, not a <span className="lime">certificate</span>
          </h1>
          <p className={styles.lead}>
            Build-time list of routes from the existing seller-conformance crawl and repair-brief
            registry. Each row records seller, route, unpaid 402 price and network, last check time,
            contract hash, and whether OpenAPI, the unpaid 402 output schema, and the CDP Bazaar row
            agree. The badge is verified, drift, or unverified. This page is inspection evidence. It
            is not a product, guarantee, or runtime monitor.
          </p>
          <div className={styles.actions}>
            <a className={styles.primary} href={FEED_URL}>
              Read verified.json
            </a>
            <a className={styles.secondary} href={SCHEMA_URL}>
              Read the schema
            </a>
            <a className={styles.secondary} href="/x402/seller-conformance">
              Seller-conformance proof
            </a>
          </div>
        </header>

        <section className={styles.section} aria-labelledby="qa-title">
          <p className="eyebrow">Owner QA</p>
          <h2 id="qa-title">Internal inspection label</h2>
          <p className={styles.prose}>
            Owner QA is labeled internal. Pilot Firstmate owns the outcome. Facts come from the
            committed crawl and the existing repair-brief registry. A missing Bazaar row is
            incomplete discovery, not a payment failure.
          </p>
        </section>

        {error ? (
          <p className={styles.error} role="alert">
            The inspection feed could not be loaded. {error}
          </p>
        ) : null}

        {feed ? (
          <section className={styles.section} aria-labelledby="rows-title">
            <div className={styles.sectionHead}>
              <p className="eyebrow">
                Generated {feed.generatedAt} · {feed.routes.length} rows · QA {feed.qa.label}
              </p>
              <h2 id="rows-title">Route rows</h2>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className={styles.caption}>
                  Same rows as {FEED_URL}. Green registry routes appear first.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Badge</th>
                    <th scope="col">Seller</th>
                    <th scope="col">Route</th>
                    <th scope="col">Price</th>
                    <th scope="col">Network</th>
                    <th scope="col">Last verified</th>
                    <th scope="col">Contract hash</th>
                    <th scope="col">OpenAPI</th>
                    <th scope="col">402 schema</th>
                    <th scope="col">Bazaar</th>
                  </tr>
                </thead>
                <tbody>
                  {feed.routes.map((row) => (
                    <tr key={`${row.method}:${row.origin}${row.route}`}>
                      <td>
                        <span className={`${styles.badge} ${styles[row.badge]}`}>{row.badge}</span>
                      </td>
                      <td>{row.seller}</td>
                      <td>
                        <code>
                          {row.method} {row.route}
                        </code>
                      </td>
                      <td>{row.price.display}</td>
                      <td>
                        <code>{row.network || "not in crawl"}</code>
                      </td>
                      <td>{row.lastVerified || "not checked"}</td>
                      <td>
                        <code className={styles.hash}>{row.contractHash || "none"}</code>
                      </td>
                      <td>{agreeLabel(row.agreement.openapi)}</td>
                      <td>{agreeLabel(row.agreement.unpaid402OutputSchema)}</td>
                      <td>{agreeLabel(row.agreement.cdpBazaarRow)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className={styles.notes}>
              {feed.limitations.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ) : error ? null : (
          <p className={styles.prose}>Loading the inspection feed.</p>
        )}
      </main>
      <Footer />
    </>
  );
}
