import { useEffect } from "react";
import { Link } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { track } from "../lib/posthog";
import {
  applyMachineMetadata,
  USEFUL_JOBS_SHELL,
  USEFUL_JOBS_ARCHIVE,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_DISCOVERY,
  USEFUL_JOBS_CATALOG,
  USEFUL_JOBS_OUTCOMES,
  USEFUL_JOBS_SOURCE_REPO,
  USEFUL_JOBS_SOURCE_COMMIT,
  USEFUL_JOBS_ARCHIVE_FREEZE,
  USEFUL_JOBS_REVIEWED_SOURCE,
  USEFUL_JOBS_COLD_START,
  USEFUL_JOBS_LIST_HELP,
  USEFUL_JOBS_EXAMPLES,
  USEFUL_JOBS_CALLER_USE,
  USEFUL_JOBS_REPEAT_USE,
  USEFUL_JOBS_ACQUIRE_TOOLS,
  USEFUL_JOBS_RUNTIME,
  SITE_ORIGIN,
} from "../data/machineEntry.mjs";
import styles from "./Mcp.module.css";

export default function UsefulJobs() {
  useEffect(() => {
    const restoreMetadata = applyMachineMetadata(document, USEFUL_JOBS_SHELL);
    track("useful_jobs_page_viewed");
    return restoreMetadata;
  }, []);

  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <header className={styles.hero}>
          <p className="eyebrow">Offline package · useful jobs</p>
          <h1 className={styles.jobH1}>
            Turn changing files into{" "}
            <span className="lime">useful next steps</span>
          </h1>
          <p className={styles.lead}>
            Six offline jobs for API changes, budgets, feeds, and delivery evidence. Download
            one archive, verify size and sha256, then run labeled <code>--example</code> samples
            or your own files on local Node 22.
          </p>
        </header>

        <section className={styles.section} aria-labelledby="acquire-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Acquire</p>
            <h2 id="acquire-title">Download, then verify before extract</h2>
          </div>
          <p className={styles.jobCopy}>
            Archive <code>{USEFUL_JOBS_ARCHIVE}</code> ({USEFUL_JOBS_ARCHIVE_BYTES} bytes). sha256{" "}
            <code>{USEFUL_JOBS_ARCHIVE_SHA256}</code>. Source <code>{USEFUL_JOBS_SOURCE_REPO}</code>{" "}
            at <code>{USEFUL_JOBS_SOURCE_COMMIT}</code>. Archive freeze{" "}
            <code>{USEFUL_JOBS_ARCHIVE_FREEZE}</code>. Reviewed source{" "}
            <code>{USEFUL_JOBS_REVIEWED_SOURCE}</code>. Discovery:{" "}
            <a className={styles.inlineLink} href={`${SITE_ORIGIN}${USEFUL_JOBS_DISCOVERY}`}>
              {SITE_ORIGIN}
              {USEFUL_JOBS_DISCOVERY}
            </a>
            . Catalog:{" "}
            <a className={styles.inlineLink} href={`${SITE_ORIGIN}${USEFUL_JOBS_CATALOG}`}>
              {SITE_ORIGIN}
              {USEFUL_JOBS_CATALOG}
            </a>
            . Outcomes:{" "}
            <a className={styles.inlineLink} href={`${SITE_ORIGIN}${USEFUL_JOBS_OUTCOMES}`}>
              {SITE_ORIGIN}
              {USEFUL_JOBS_OUTCOMES}
            </a>
            .
          </p>
          <p className={styles.jobCopy}>
            Acquisition tools (download, size/sha256 check, extract):{" "}
            <code>{USEFUL_JOBS_ACQUIRE_TOOLS.join(", ")}</code>. After extract, offline runtime is{" "}
            <code>{USEFUL_JOBS_RUNTIME}</code>. This repository is not required.
          </p>
          <p className={styles.jobCopy}>
            If the size, digest, or HTTP status is wrong, do not extract and do not run the CLI.
          </p>
          <div className={styles.commands}>
            <div>
              <span>Install / cold start (stdout is the kit path only)</span>
              <pre className={styles.jobPre}>
                <code>{USEFUL_JOBS_COLD_START}</code>
              </pre>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="jobs-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Jobs</p>
            <h2 id="jobs-title">When each job is useful</h2>
          </div>
          <p className={styles.jobCopy}>
            <code>node bin/useful-jobs.mjs</code> routes six offline jobs. Labeled samples require
            an explicit <code>--example</code> flag. Ordinary callers must supply their own files.
          </p>
          <ol className={styles.flow}>
            <li>
              <strong>
                <code>api-upgrade-brief</code>.
              </strong>{" "}
              Compare before/after OpenAPI against used-operation pins. Inputs:{" "}
              <code>--before --after --used</code>. Outputs: <code>upgrade-brief.json/.md</code>.
            </li>
            <li>
              <strong>
                <code>vendor-budget-impact</code>.
              </strong>{" "}
              Scan curated pricing-row JSON for field/unit deltas. Inputs:{" "}
              <code>--before --after</code>. Outputs: <code>budget-impact.json/.md</code>.
            </li>
            <li>
              <strong>
                <code>feed-agenda</code>.
              </strong>{" "}
              Turn RSS/Atom before/after deltas into agenda JSON plus ICS. Sample feeds are not
              live deadlines. Inputs: <code>--before --after</code>.
            </li>
            <li>
              <strong>
                <code>evidence-ci-annotation</code>.
              </strong>{" "}
              Format a schema-compatible evidence packet into CI annotations. Caller packets stay
              unattested. Input: <code>--input</code>.
            </li>
            <li>
              <strong>
                <code>listing-repair-packet</code>.
              </strong>{" "}
              Build a source-linked owner repair packet from listing/route snapshots. Partial
              evidence stays non-final. Input: <code>--input</code>.
            </li>
            <li>
              <strong>
                <code>repeat-job-record</code>.
              </strong>{" "}
              Build an operator next-run record with local byte checks. Not a daemon. Input:{" "}
              <code>--next-run</code> (optional <code>--input-root</code>).
            </li>
          </ol>
          <div className={styles.commands}>
            <div>
              <span>List and help</span>
              <pre className={styles.jobPre}>
                <code>{USEFUL_JOBS_LIST_HELP}</code>
              </pre>
            </div>
            <div>
              <span>Labeled SAMPLE examples (not caller files)</span>
              <pre className={styles.jobPre}>
                <code>{USEFUL_JOBS_EXAMPLES}</code>
              </pre>
            </div>
            <div>
              <span>Two different callers</span>
              <pre className={styles.jobPre}>
                <code>{USEFUL_JOBS_CALLER_USE}</code>
              </pre>
            </div>
            <div>
              <span>Changed-file repeat</span>
              <pre className={styles.jobPre}>
                <code>{USEFUL_JOBS_REPEAT_USE}</code>
              </pre>
            </div>
          </div>
        </section>

        <section className={styles.sellerOffer} aria-labelledby="boundary-title">
          <div>
            <p className="eyebrow">Scope</p>
            <h2 id="boundary-title">What this package covers</h2>
            <p>
              Free local package only; it does not start hosted extract on{" "}
              <Link className={styles.inlineLink} to="/for-agents">
                /for-agents
              </Link>
              . Partial vendor or listing evidence stays non-final. Evidence CI annotations from
              caller packets stay unattested. Repeat job records are operator documents, not a
              running scheduler.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primary} to="/for-agents">
                Practical agent jobs
              </Link>
              <a className={styles.secondary} href={USEFUL_JOBS_ARCHIVE}>
                Download archive
              </a>
              <a className={styles.secondary} href={USEFUL_JOBS_DISCOVERY}>
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
