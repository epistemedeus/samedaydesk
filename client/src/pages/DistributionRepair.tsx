import { useEffect } from "react";
import { Link } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { track } from "../lib/posthog";
import {
  applyMachineMetadata,
  DISTRIBUTION_REPAIR_SHELL,
  DISTRIBUTION_REPAIR_ARCHIVE,
  DISTRIBUTION_REPAIR_ARCHIVE_SHA256,
  DISTRIBUTION_REPAIR_ARCHIVE_BYTES,
  DISTRIBUTION_REPAIR_RECORD04_PIN,
  DISTRIBUTION_REPAIR_DIST08_PIN,
  DISTRIBUTION_REPAIR_NL06_PIN,
  DISTRIBUTION_REPAIR_DISCOVERY,
  DISTRIBUTION_REPAIR_COLD_START,
  DISTRIBUTION_REPAIR_FIRST_USE,
  DISTRIBUTION_REPAIR_REPEAT_USE,
  SITE_ORIGIN,
} from "../data/machineEntry.mjs";
import styles from "./Mcp.module.css";

export default function DistributionRepair() {
  useEffect(() => {
    const restoreMetadata = applyMachineMetadata(document, DISTRIBUTION_REPAIR_SHELL);
    track("distribution_repair_page_viewed");
    return restoreMetadata;
  }, []);

  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <header className={styles.hero}>
          <p className="eyebrow">Machine jobs · offline distribution repair</p>
          <h1 className={styles.jobH1}>
            Why a listed tool cannot run — one <span className="lime">portable diagnosis package</span>
          </h1>
          <p className={styles.lead}>
            An operator supplies source-bound discovery/listing snapshots and a baseline/current
            route pair. The shared CLI reuses Record04, DIST08, and NL06 and returns an explainable
            diagnosis plus owner repair guidance. Incomplete captures cannot prove global removal.
            This is not lost-customer proof, not priced execution, and not a production acquisition.
          </p>
        </header>

        <section className={styles.section} aria-labelledby="acquire-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Acquire · lean archive</p>
            <h2 id="acquire-title">Download the portable package</h2>
          </div>
          <p className={styles.jobCopy}>
            Archive <code>{DISTRIBUTION_REPAIR_ARCHIVE}</code> ({DISTRIBUTION_REPAIR_ARCHIVE_BYTES}{" "}
            bytes). sha256 <code>{DISTRIBUTION_REPAIR_ARCHIVE_SHA256}</code>. Record04{" "}
            <code>{DISTRIBUTION_REPAIR_RECORD04_PIN}</code>. DIST08{" "}
            <code>{DISTRIBUTION_REPAIR_DIST08_PIN}</code>. NL06{" "}
            <code>{DISTRIBUTION_REPAIR_NL06_PIN}</code>. Machine discovery:{" "}
            <a className={styles.inlineLink} href={`${SITE_ORIGIN}${DISTRIBUTION_REPAIR_DISCOVERY}`}>
              {SITE_ORIGIN}
              {DISTRIBUTION_REPAIR_DISCOVERY}
            </a>
            .
          </p>
          <div className={styles.commands}>
            <div>
              <span>Cold start (Node 20+; 22 preferred)</span>
              <pre className={styles.jobPre}>
                <code>{DISTRIBUTION_REPAIR_COLD_START}</code>
              </pre>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="use-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Use · caller snapshots</p>
            <h2 id="use-title">Identity-bound diagnosis, not a filename join</h2>
          </div>
          <p className={styles.jobCopy}>
            <code>node bin/distribution-repair.mjs</code> dispatches to the vendored modules. Missing
            identity stays <code>unknown</code>. Unrelated sources stay unjoined. A content-preserving
            rename does not change the diagnosis. Grexal is never inferred as a universal adapter.
          </p>
          <div className={styles.commands}>
            <div>
              <span>Caller-supplied inputs</span>
              <pre className={styles.jobPre}>
                <code>{DISTRIBUTION_REPAIR_FIRST_USE}</code>
              </pre>
            </div>
            <div>
              <span>Repeat after a route correction</span>
              <pre className={styles.jobPre}>
                <code>{DISTRIBUTION_REPAIR_REPEAT_USE}</code>
              </pre>
            </div>
          </div>
        </section>

        <section className={styles.sellerOffer} aria-labelledby="boundary-title">
          <div>
            <p className="eyebrow">Boundary</p>
            <h2 id="boundary-title">Free diagnosis vs priced execution</h2>
            <p>
              This package compares already-held snapshots. It does not fetch, charge, sign, or
              mutate a live listing. Practical paid observation commands stay on{" "}
              <Link className={styles.inlineLink} to="/for-agents">
                /for-agents
              </Link>
              . Homepage identity and design are unchanged. Root still owns publication.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primary} to="/for-agents">
                Practical agent jobs
              </Link>
              <a className={styles.secondary} href={DISTRIBUTION_REPAIR_ARCHIVE}>
                Download archive
              </a>
              <a className={styles.secondary} href={DISTRIBUTION_REPAIR_DISCOVERY}>
                Discovery JSON
              </a>
            </div>
          </div>
          <div className={styles.offerCard}>
            <span>Honesty contract</span>
            <ul>
              <li>Free offline diagnosis is not priced execution</li>
              <li>Incomplete catalog/current cannot prove global removal</li>
              <li>Missing identity stays unknown/partial</li>
              <li>Unrelated sources do not join</li>
              <li>Repair is owner guidance, not lost-customer proof</li>
              <li>No Grexal-universal adapter</li>
              <li>No new pricing, cron, or subscription</li>
              <li>No production acquisition claim before Root release</li>
            </ul>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
