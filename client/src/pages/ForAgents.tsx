import { useEffect } from "react";
import { Link } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { track } from "../lib/posthog";
import {
  COMPARE_QUICKSTART,
  CUSTOMER_EXAMPLE_DIR,
  CUSTOMER_EXAMPLE_VERSION,
  EXPLICIT_RECORD_SKILL,
  applyMachineMetadata,
  FOR_AGENTS_SHELL,
  GATEWAY_ORIGIN,
  LIVE_INVENTORY,
  MERCHANT_PIN,
  MERCHANT_REPO,
  OBSERVE_QUICKSTART,
  RECORD_QUICKSTART,
  REUSE_QUICKSTART,
  RECURRING_QUICKSTART,
} from "../data/machineEntry.mjs";
import styles from "./Mcp.module.css";

export default function ForAgents() {
  useEffect(() => {
    const restoreMetadata = applyMachineMetadata(document, FOR_AGENTS_SHELL);
    track("for_agents_page_viewed");
    return restoreMetadata;
  }, []);

  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <header className={styles.hero}>
          <p className="eyebrow">Machine jobs · acquire or work offline</p>
          <h1 className={styles.jobH1}>
            Obtain observations, use offline jobs, or <span className="lime">opt-in reuse</span>
          </h1>
          <p className={styles.lead}>
            SameDayDesk sells a bounded <code>POST /extract/batch</code> attempt: one to five public
            HTTPS URLs, caller-selected fields, 0.01 USDC. A later comparison of two already-held JSON
            artifacts is free, local, and does not fetch. Paid freshness and offline comparison stay
            distinct. Installation grants no payment authority.
          </p>
          <p className={styles.lead}>
            Current paid HTTP and MCP inventories live on the merchant. This page does not freeze a
            route count. Failed, partial, and missing rows stay visible. Observation freshness is unknown
            unless you supply a clock and a horizon. <code>charged: true</code> is not useful output.
            Current source labels are untrusted, not buyer proof. Purchasing never requires publishing
            or referrals.
          </p>
        </header>

        <section className={styles.section} aria-labelledby="observe-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Job 1 · paid observation</p>
            <h2 id="observe-title">Obtain bounded extracted observations</h2>
          </div>
          <p className={styles.jobCopy}>
            Public customer example {CUSTOMER_EXAMPLE_VERSION} at{" "}
            <a
              className={styles.inlineLink}
              href={`${MERCHANT_REPO}/tree/${MERCHANT_PIN}/${CUSTOMER_EXAMPLE_DIR}`}
            >
              {MERCHANT_REPO}/tree/{MERCHANT_PIN}/{CUSTOMER_EXAMPLE_DIR}
            </a>
            . Requires Node.js 22.x and a full Git checkout, not a packed tarball.
            Default commands are unpaid preflight against the live merchant, not an offline fixture. They
            sign nothing. Inspect and edit <code>fixtures/authorization-batch.json</code> yourself before any{" "}
            <code>--approve</code> purchase. Optional attempt receipt and read-only reconcile are
            separate. Reconcile an unknown payment outcome instead of automatically retrying.
            This page includes no keys, secret URLs, or purchase.
          </p>
          <ol className={styles.flow}>
            <li>Clone the public merchant and check out the pinned commit.</li>
            <li>Verify <code>node --version</code> reports v22.x, then run <code>npm ci</code>.</li>
            <li>Run <code>npm start</code> for unpaid batch preflight.</li>
            <li>Inspect and edit the authorization file. Installation still has no payment authority.</li>
            <li>Purchase only with an explicit <code>--approve</code> and a wallet you inject.</li>
            <li>Keep failed, partial, and missing rows. They are not a refund.</li>
          </ol>
          <div className={styles.commands}>
            <div>
              <span>No-key unpaid preflight</span>
              <pre className={styles.jobPre}><code>{OBSERVE_QUICKSTART}</code></pre>
            </div>
          </div>
          <p className={styles.jobCopy}>
            Backward-compatible single URL: <code>GET {GATEWAY_ORIGIN}/extract</code>. The practical
            multi-URL job is <code>POST {GATEWAY_ORIGIN}/extract/batch</code>.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="compare-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Job 2 · free offline comparison</p>
            <h2 id="compare-title">Compare explicit fields from two already-held observations</h2>
          </div>
          <p className={styles.jobCopy}>
            From the same <code>{CUSTOMER_EXAMPLE_DIR}</code> directory after <code>npm ci</code>. The
            recipe does not fetch, pay, retry, or contact the merchant. Selected fields are required. An
            absent selected field is coverage unknown, not deletion. Reordered rows with the same source
            URL are order, not content change. Fixture output is owner proof, not buyer demand.
          </p>
          <div className={styles.commands}>
            <div>
              <span>Copyable fixture comparison</span>
              <pre className={styles.jobPre}><code>{COMPARE_QUICKSTART}</code></pre>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="record-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Job 3 · free offline records</p>
            <h2 id="record-title">Map already-held JSON into buyer records</h2>
          </div>
          <p className={styles.jobCopy}>
            From the same pinned checkout and directory, the explicit-record CLI maps only
            buyer-named JSON Pointers and validates the result against the buyer&apos;s local JSON
            Schema. It does not fetch or infer. In the product and organization/contact examples,
            missing <code>sku</code> and <code>email</code> are optional. The command below is a
            separate truthful required-field example: it keeps one usable product record, labels the
            row missing required <code>sku</code> invalid, accounts for the failed source row, writes
            all three artifacts, and exits 1.{" "}
            <a className={styles.inlineLink} href={EXPLICIT_RECORD_SKILL}>
              Read the pinned explicit-record workflow
            </a>
            .
          </p>
          <div className={styles.commands}>
            <div>
              <span>Copyable required-field example</span>
              <pre className={styles.jobPre}><code>{RECORD_QUICKSTART}</code></pre>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="reuse-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Job 4 · opt-in reuse</p>
            <h2 id="reuse-title">Export a reviewed reuse reference from an already produced result</h2>
          </div>
          <p className={styles.jobCopy}>
            From a SameDayDesk checkout, preview exactly which fields would be copied into a{" "}
            <code>neomorphic.task-memory.observation.v1</code> reference, then write only with{" "}
            <code>--opt-in</code>. The helper does not fetch or pay. Default page-change and record
            outputs stay intact. The projection uses a reviewed allowlist, not a harmlessness guarantee.
            A schema-valid export is user-selected unverified evidence, never automatic public-safe
            certification. Private source text, authorization, receipt secrets, and legal or customer
            identifiers are omitted and cannot be selected. Failed and incomplete rows remain visible.
            The caller supplies stable task, subject, revision sequence, and current UTC clock values;
            the helper does not invent them. If an original evidence URL is missing, the export labels
            the recipe URL as a locator rather than evidence. Later task-memory import is a separate step.
          </p>
          <div className={styles.commands}>
            <div>
              <span>Preview, then opt-in write</span>
              <pre className={styles.jobPre}><code>{REUSE_QUICKSTART}</code></pre>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="recurring-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Job 5 · recurring recipes</p>
            <h2 id="recurring-title">Run one-shot page and record jobs against an immutable prior</h2>
          </div>
          <p className={styles.jobCopy}>
            From a SameDayDesk checkout, run <code>source-change-alert</code>,{" "}
            <code>comparable-record-extraction</code>, or <code>verification-reconcile</code>.
            You supply sources, fields, schedule hint, clock, and an optional freshness horizon.
            Outcomes are unchanged, changed, partial, stale baseline, or error. Priors stay
            immutable; write a new sequenced artifact after review. Partial and failed rows stay
            visible. Payment receipts are never automatically replayed. Offline fixture dry-runs
            do not call the merchant. Optional <code>--live-safe</code> may fetch only{" "}
            <code>https://example.com/</code> and still uses operator network and CPU. The sourced
            0.01 USDC batch price on this page is not invoked by these recipes. No cron or
            always-on service is started.
          </p>
          <div className={styles.commands}>
            <div>
              <span>Fixture dry-runs for the three recipes</span>
              <pre className={styles.jobPre}><code>{RECURRING_QUICKSTART}</code></pre>
            </div>
          </div>
        </section>

        <section className={styles.sellerOffer} aria-labelledby="inventory-title">
          <div>
            <p className="eyebrow">Live merchant inventory</p>
            <h2 id="inventory-title">Counts come from the live merchant, not this page</h2>
            <p>
              Health, the HTTP catalog, the x402 manifest, OpenAPI, and MCP are the current inventories.
              Human Stripe offers stay on the homepage. This page does not sell those SKUs.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primary} to="/x402">
                Other machine services
              </Link>
              <Link className={styles.secondary} to="/x402/seller-conformance">
                Seller conformance proof
              </Link>
              <Link className={styles.secondary} to="/x402/verified">
                Inspected route list
              </Link>
            </div>
          </div>
          <div className={styles.offerCard}>
            <span>Honesty contract</span>
            <ul>
              <li>Paid observation is not offline comparison</li>
              <li>Failed, partial, and missing rows stay visible</li>
              <li>Freshness is unknown without a clock and horizon</li>
              <li>charged: true is not useful output</li>
              <li>Source labels remain caller-declared, not independent buyer proof</li>
              <li>No keys, secret URLs, or target fetch on this page</li>
              <li>Purchasing never requires publishing</li>
              <li>Schema-valid export is not public-safe certification</li>
              <li>Recurring recipes do not overwrite immutable priors</li>
              <li>Payment is never automatically replayed</li>
            </ul>
          </div>
        </section>

        <section className={styles.connect} aria-labelledby="live-title">
          <div>
            <p className="eyebrow">Authoritative inventories</p>
            <h2 id="live-title">Read the live merchant, not a copied count</h2>
          </div>
          <div className={styles.commands}>
            {LIVE_INVENTORY.map((item) => (
              <div key={item.href}>
                <span>{item.label}</span>
                <a href={item.href}>{item.href}</a>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
