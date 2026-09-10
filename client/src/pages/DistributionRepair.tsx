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
          <p className="eyebrow">Offline package · listing diagnosis</p>
          <h1 className={styles.jobH1}>
            Diagnose why a listed tool cannot run from{" "}
            <span className="lime">your snapshots</span>
          </h1>
          <p className={styles.lead}>
            Supply discovery/listing snapshots and a baseline/current route pair. The offline CLI
            returns an explainable diagnosis and owner repair guidance. It runs only on the files you
            pass (or labeled samples). It does not call priced endpoints or change a live listing.
          </p>
        </header>

        <section className={styles.section} aria-labelledby="acquire-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Acquire</p>
            <h2 id="acquire-title">Download the portable package</h2>
          </div>
          <p className={styles.jobCopy}>
            Archive <code>{DISTRIBUTION_REPAIR_ARCHIVE}</code> ({DISTRIBUTION_REPAIR_ARCHIVE_BYTES}{" "}
            bytes). sha256 <code>{DISTRIBUTION_REPAIR_ARCHIVE_SHA256}</code>. Source pins{" "}
            <code>{DISTRIBUTION_REPAIR_RECORD04_PIN}</code>,{" "}
            <code>{DISTRIBUTION_REPAIR_DIST08_PIN}</code>,{" "}
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
            <p className="eyebrow">Use</p>
            <h2 id="use-title">Join by provider identity, not by filename</h2>
          </div>
          <p className={styles.jobCopy}>
            <code>node bin/distribution-repair.mjs</code> joins on provider / jobRef /
            sharedEvidenceId. Missing identity stays <code>unknown</code>. Unrelated sources stay
            unjoined. Renaming a file without changing content does not change the diagnosis.
          </p>
          <div className={styles.commands}>
            <div>
              <span>Caller-shaped inputs (examples/caller)</span>
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
            <p className="eyebrow">Scope</p>
            <h2 id="boundary-title">What this package runs</h2>
            <p>
              Offline diagnosis of already-held snapshots. Paid observation commands stay on{" "}
              <Link className={styles.inlineLink} to="/for-agents">
                /for-agents
              </Link>{" "}
              and are not started here. Repair output is owner guidance, not proof of lost customers
              or revenue.
            </p>
            <p>
              Material limit: incomplete captures cannot prove a listing was removed everywhere.
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
        </section>
      </main>
      <Footer />
    </>
  );
}
