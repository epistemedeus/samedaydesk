import { useEffect } from "react";
import { Link } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { track } from "../lib/posthog";
import {
  applyMachineMetadata,
  CONSUMER_REPEAT_SHELL,
  CONSUMER_REPEAT_ARCHIVE,
  CONSUMER_REPEAT_ARCHIVE_SHA256,
  CONSUMER_REPEAT_ARCHIVE_BYTES,
  CONSUMER_REPEAT_DISCOVERY,
  CONSUMER_REPEAT_SOURCE_REPO,
  CONSUMER_REPEAT_SOURCE_COMMIT,
  CONSUMER_REPEAT_REVIEWED_SOURCE,
  CONSUMER_REPEAT_COLD_START,
  CONSUMER_REPEAT_FIRST_USE,
  CONSUMER_REPEAT_CALLER_USE,
  CONSUMER_REPEAT_REPEAT_USE,
  SITE_ORIGIN,
} from "../data/machineEntry.mjs";
import styles from "./Mcp.module.css";

export default function ConsumerRepeat() {
  useEffect(() => {
    const restoreMetadata = applyMachineMetadata(document, CONSUMER_REPEAT_SHELL);
    track("consumer_repeat_page_viewed");
    return restoreMetadata;
  }, []);

  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <header className={styles.hero}>
          <p className="eyebrow">Offline package · consumer evidence</p>
          <h1 className={styles.jobH1}>
            Run local evidence jobs from a portable package{" "}
            <span className="lime">offline</span>
          </h1>
          <p className={styles.lead}>
            Download one archive. Verify the size and sha256, extract it, then run labeled
            samples or your own files on a local Node 22 runtime. The CLI reads local files
            only. It does not fetch live sources, charge a wallet, or overwrite caller files.
          </p>
          <p className={styles.lead}>
            Jobs cover a documentation migration checklist, a release evidence brief, table
            reconcile, link index, replay pack, freshness receipt, procurement brief, a thin
            customer result package, and acquisition status. Announced, shipped, and tested
            stay distinct. Partial and refused outcomes stay visible.
          </p>
        </header>

        <section className={styles.section} aria-labelledby="acquire-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Acquire</p>
            <h2 id="acquire-title">Download, then verify before extract</h2>
          </div>
          <p className={styles.jobCopy}>
            Archive <code>{CONSUMER_REPEAT_ARCHIVE}</code> ({CONSUMER_REPEAT_ARCHIVE_BYTES}{" "}
            bytes). sha256 <code>{CONSUMER_REPEAT_ARCHIVE_SHA256}</code>. Source{" "}
            <code>{CONSUMER_REPEAT_SOURCE_REPO}</code> at{" "}
            <code>{CONSUMER_REPEAT_SOURCE_COMMIT}</code>. Reviewed package source{" "}
            <code>{CONSUMER_REPEAT_REVIEWED_SOURCE}</code>. Machine discovery:{" "}
            <a className={styles.inlineLink} href={`${SITE_ORIGIN}${CONSUMER_REPEAT_DISCOVERY}`}>
              {SITE_ORIGIN}
              {CONSUMER_REPEAT_DISCOVERY}
            </a>
            .
          </p>
          <p className={styles.jobCopy}>
            If the size, digest, or HTTP status is wrong, do not extract and do not run the CLI.
            First use needs Node 22 and the archive only. It does not need this repository.
          </p>
          <div className={styles.commands}>
            <div>
              <span>Cold start (Node 22; verify size and sha256)</span>
              <pre className={styles.jobPre}>
                <code>{CONSUMER_REPEAT_COLD_START}</code>
              </pre>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="jobs-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Jobs</p>
            <h2 id="jobs-title">Local evidence checks, one CLI</h2>
          </div>
          <p className={styles.jobCopy}>
            <code>node bin/s178-cli.mjs</code> routes each job. Labeled samples are marked as
            samples. Default <code>run</code> without <code>--in</code> uses the labeled
            positive example. Pass your own JSON with <code>--in</code>. Write{" "}
            <code>repeatInput</code> to a new file when you want a later run; the CLI does not
            rewrite the caller input.
          </p>
          <ol className={styles.flow}>
            <li>
              <strong>Release evidence brief.</strong> Announced, shipped, and tested stay
              separate. Conflict and partial coverage stay explicit.
            </li>
            <li>
              <strong>Tables, links, freshness, replay.</strong> Incomplete rows and missing
              times stay visible. Paid markers are not treated as unpaid success.
            </li>
            <li>
              <strong>Procurement and result package.</strong> Malformed input is refused.
              <code>ok: true</code> is honest completion, not a pass.
            </li>
          </ol>
          <div className={styles.commands}>
            <div>
              <span>Labeled samples (not live caller input)</span>
              <pre className={styles.jobPre}>
                <code>{CONSUMER_REPEAT_FIRST_USE}</code>
              </pre>
            </div>
            <div>
              <span>Caller files (CLI does not overwrite them)</span>
              <pre className={styles.jobPre}>
                <code>{CONSUMER_REPEAT_CALLER_USE}</code>
              </pre>
            </div>
            <div>
              <span>Changed-input repeat (new output file)</span>
              <pre className={styles.jobPre}>
                <code>{CONSUMER_REPEAT_REPEAT_USE}</code>
              </pre>
            </div>
          </div>
        </section>

        <section className={styles.sellerOffer} aria-labelledby="boundary-title">
          <div>
            <p className="eyebrow">Scope</p>
            <h2 id="boundary-title">What this package runs</h2>
            <p>
              Offline evidence jobs on files you already have (or the labeled samples above).
              Optional paid merchant extract on{" "}
              <Link className={styles.inlineLink} to="/for-agents">
                /for-agents
              </Link>{" "}
              stays a separate product and is not started by this CLI. A local completion is
              not an actual customer delivery.
            </p>
            <p>
              Material limit: you must supply an operator clock. Local provenance files are
              integrity metadata, not an independent attestation, and <code>ok:true</code> is
              honest completion rather than a pass.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primary} to="/for-agents">
                Practical agent jobs
              </Link>
              <a className={styles.secondary} href={CONSUMER_REPEAT_ARCHIVE}>
                Download archive
              </a>
              <a className={styles.secondary} href={CONSUMER_REPEAT_DISCOVERY}>
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
