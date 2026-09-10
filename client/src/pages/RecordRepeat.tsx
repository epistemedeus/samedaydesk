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
          <p className="eyebrow">Offline package · source comparison</p>
          <h1 className={styles.jobH1}>
            Compare OpenAPI ops, price rows, keyed CSV, and feeds{" "}
            <span className="lime">offline</span>
          </h1>
          <p className={styles.lead}>
            Download one portable package. Run labeled samples or your own before/after files on a
            local Node runtime, then keep a next-run manifest for the next pair. The CLI reads local
            files only. It does not fetch live sources, charge a wallet, or schedule work.
          </p>
          <p className={styles.lead}>
            Four jobs share one CLI: OpenAPI used-operation impact, curated price/unit row changes,
            keyed CSV drift, and RSS/Atom correction briefs. Unsupported HTML and missing identity or
            units stay explicit in the result.
          </p>
        </header>

        <section className={styles.section} aria-labelledby="acquire-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Acquire</p>
            <h2 id="acquire-title">Download the portable package</h2>
          </div>
          <p className={styles.jobCopy}>
            Archive <code>{RECORD_REPEAT_ARCHIVE}</code> ({RECORD_REPEAT_ARCHIVE_BYTES} bytes). sha256{" "}
            <code>{RECORD_REPEAT_ARCHIVE_SHA256}</code>. Parser pin{" "}
            <code>{RECORD_REPEAT_PARSER_PIN}</code>. Recipe pin <code>{RECORD_REPEAT_RECIPE_PIN}</code>.
            Machine discovery:{" "}
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
            <p className="eyebrow">Jobs</p>
            <h2 id="families-title">Four source comparisons, one CLI</h2>
          </div>
          <p className={styles.jobCopy}>
            <code>node bin/record-repeat.mjs</code> routes each job to the pinned parsers in the
            archive. Labeled samples are marked as samples. Observed no-change on a real pair is a
            valid result.
          </p>
          <ol className={styles.flow}>
            <li>
              <strong>OpenAPI used-ops.</strong> Pinned operations only; out-of-pin webhook edits stay
              out of scope.
            </li>
            <li>
              <strong>Price row/unit.</strong> Curated rows with units; HTML extraction is refused.
            </li>
            <li>
              <strong>Keyed CSV.</strong> A key is required; duplicate keys block definitive counts;
              empty is not missing.
            </li>
            <li>
              <strong>RSS/Atom.</strong> Corrections and dedup; non-feed HTML is refused.
            </li>
          </ol>
          <div className={styles.commands}>
            <div>
              <span>Labeled samples (not live caller input)</span>
              <pre className={styles.jobPre}>
                <code>{RECORD_REPEAT_FIRST_USE}</code>
              </pre>
            </div>
            <div>
              <span>Repeat with a next-run manifest (sample paths shown)</span>
              <pre className={styles.jobPre}>
                <code>{RECORD_REPEAT_REPEAT_USE}</code>
              </pre>
            </div>
          </div>
        </section>

        <section className={styles.sellerOffer} aria-labelledby="boundary-title">
          <div>
            <p className="eyebrow">Scope</p>
            <h2 id="boundary-title">What this package runs</h2>
            <p>
              Offline comparison of files you already have (or the labeled samples above). Optional
              paid merchant extract on{" "}
              <Link className={styles.inlineLink} to="/for-agents">
                /for-agents
              </Link>{" "}
              stays a separate product and is not started by this CLI.
            </p>
            <p>
              Material limit: unsupported HTML and missing identity or units are refused, not invented
              into rows.
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
        </section>
      </main>
      <Footer />
    </>
  );
}
