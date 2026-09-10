import { useEffect } from "react";
import { Link } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { track } from "../lib/posthog";
import {
  applyMachineMetadata,
  RECORD_REPEAT_SHELL,
  RECORD_REPEAT_ARCHIVE,
  RECORD_REPEAT_ARCHIVE_SHA256,
  RECORD_REPEAT_ARCHIVE_BYTES,
  RECORD_REPEAT_PARSER_PIN,
  RECORD_REPEAT_RECIPE_PIN,
  RECORD_REPEAT_DISCOVERY,
  RECORD_REPEAT_COLD_START,
  RECORD_REPEAT_FIRST_USE,
  RECORD_REPEAT_REPEAT_USE,
  SITE_ORIGIN,
} from "../data/machineEntry.mjs";
import styles from "./Mcp.module.css";

export default function RecordRepeat() {
  useEffect(() => {
    const restoreMetadata = applyMachineMetadata(document, RECORD_REPEAT_SHELL);
    track("record_repeat_page_viewed");
    return restoreMetadata;
  }, []);

  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <header className={styles.hero}>
          <p className="eyebrow">Machine jobs · offline source/record package</p>
          <h1 className={styles.jobH1}>
            Source/record repeat jobs — one <span className="lime">portable offline package</span>
          </h1>
          <p className={styles.lead}>
            A cold agent discovers a concrete source-comparison job, downloads one lean archive,
            prepares bounded local input or a labeled free sample, runs the shared CLI, and keeps a
            next-run manifest — without a private workspace. Free local processing stays distinct
            from the optional existing paid merchant extract. No new price, cron, settlement, or
            unattended subscription.
          </p>
          <p className={styles.lead}>
            Four families share one manifest/CLI pattern: OpenAPI used-operation impact, curated
            pricing row/unit change, keyed CSV drift, and RSS/Atom correction briefs. Unsupported HTML
            and missing identity/units stay explicit. Bot record kit paths stay out of scope.
          </p>
        </header>

        <section className={styles.section} aria-labelledby="acquire-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Acquire · lean archive</p>
            <h2 id="acquire-title">Download the portable package</h2>
          </div>
          <p className={styles.jobCopy}>
            Archive <code>{RECORD_REPEAT_ARCHIVE}</code> ({RECORD_REPEAT_ARCHIVE_BYTES} bytes). sha256{" "}
            <code>{RECORD_REPEAT_ARCHIVE_SHA256}</code>. Parser tip <code>{RECORD_REPEAT_PARSER_PIN}</code>.
            Recipe tip <code>{RECORD_REPEAT_RECIPE_PIN}</code>. Machine discovery:{" "}
            <a className={styles.inlineLink} href={`${SITE_ORIGIN}${RECORD_REPEAT_DISCOVERY}`}>
              {SITE_ORIGIN}
              {RECORD_REPEAT_DISCOVERY}
            </a>
            .
          </p>
          <div className={styles.commands}>
            <div>
              <span>Cold start (Node 20+; 22 preferred)</span>
              <pre className={styles.jobPre}>
                <code>{RECORD_REPEAT_COLD_START}</code>
              </pre>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="families-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Families · one shared CLI</p>
            <h2 id="families-title">Four coherent source families</h2>
          </div>
          <p className={styles.jobCopy}>
            <code>node bin/record-repeat.mjs</code> dispatches to the existing S134 parsers. No second
            parser engine. Synthetic fixtures stay labeled. Observed no-change on a real pair is valid.
          </p>
          <ol className={styles.flow}>
            <li>
              <strong>OpenAPI used-ops</strong> — pinned operations only; out-of-pin webhook edits stay
              out of scope.
            </li>
            <li>
              <strong>Pricing row/unit</strong> — curated rows with units; HTML extraction refused.
            </li>
            <li>
              <strong>Keyed CSV</strong> — key required; duplicate keys block definitive counts;
              empty≠missing.
            </li>
            <li>
              <strong>RSS/Atom</strong> — corrections/dedup; non-feed HTML refused.
            </li>
          </ol>
          <div className={styles.commands}>
            <div>
              <span>Literal first-use samples</span>
              <pre className={styles.jobPre}>
                <code>{RECORD_REPEAT_FIRST_USE}</code>
              </pre>
            </div>
            <div>
              <span>Repeat use via next-run manifest</span>
              <pre className={styles.jobPre}>
                <code>{RECORD_REPEAT_REPEAT_USE}</code>
              </pre>
            </div>
          </div>
        </section>

        <section className={styles.sellerOffer} aria-labelledby="boundary-title">
          <div>
            <p className="eyebrow">Boundary</p>
            <h2 id="boundary-title">Free offline vs optional paid extract</h2>
            <p>
              This package compares already-held local artifacts. It does not fetch, charge, sign, or
              schedule. The existing paid merchant extract remains optional and separate. Practical paid
              observation commands stay on{" "}
              <Link className={styles.inlineLink} to="/for-agents">
                /for-agents
              </Link>
              . Homepage identity and design are unchanged.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primary} to="/for-agents">
                Practical agent jobs
              </Link>
              <a className={styles.secondary} href={RECORD_REPEAT_ARCHIVE}>
                Download archive
              </a>
              <a className={styles.secondary} href={RECORD_REPEAT_DISCOVERY}>
                Discovery JSON
              </a>
            </div>
          </div>
          <div className={styles.offerCard}>
            <span>Honesty contract</span>
            <ul>
              <li>Free offline processing is not paid extract</li>
              <li>Unsupported HTML is refused, not scraped into rows</li>
              <li>Missing identity/units stay explicit</li>
              <li>Partial and blocked modes stay visible</li>
              <li>Synthetic fixtures stay labeled</li>
              <li>No new pricing, demand, settlement, or unattended subscription</li>
              <li>No server cron</li>
              <li>Bot record kit / native05..08 stay out of scope</li>
              <li>No private paths, secrets, or transcripts in the archive</li>
            </ul>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
