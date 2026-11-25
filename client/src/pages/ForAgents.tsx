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
  BUYER_SETUP_QUICKSTART,
} from "../data/machineEntry.mjs";
import {
  GENTECH_DEFI_RESOLVED_CASE,
  sellerResolvedCasePath,
} from "../data/sellerResolvedCases";
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
          <p className="eyebrow">Paid web extraction · free local tools</p>
          <h1 className={styles.jobH1}>
            Fresh web data for your agent, and <span className="lime">free tools to use it</span>
          </h1>
          <p className={styles.lead}>
            Your agent names up to five web pages and the details it needs from them, and gets clean data
            back for one cent. No key, no account. Comparing and reusing what it fetched is free.
          </p>
          <div className={styles.actions}>
            <a className={styles.primary} href="#observe-title">Fetch your first pages →</a>
          </div>
          <h2 className={styles.buyHead}>What your agent can buy here</h2>
          <ul className={styles.buyList}>
            <li><a href="#observe-title">Fields from up to five web pages, as clean JSON</a><span>0.01 USDC a batch, paid per call with x402. No key, account or subscription.</span></li>
            <li><a href="#compare-title">Compare, map and reuse what it already fetched</a><span>Free. Runs on your own machine.</span></li>
            <li><a href="#record-repeat-title">Offline packages for records, tools and evidence jobs</a><span>Free to download and run.</span></li>
            <li><a href="#inventory-title">Every other paid tool on the live gateway</a><span>Each call states its price before payment.</span></li>
          </ul>
          <p className={styles.lead}>
            Every page you asked for comes back with a row, including the ones that failed, so your agent always knows what it has.
          </p>
        </header>

        <section className={styles.section} aria-labelledby="observe-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Job 1 · paid observation</p>
            <h2 id="observe-title">Fetch fields from up to five pages</h2>
          </div>
          <p className={styles.jobCopy}>
            Public customer example {CUSTOMER_EXAMPLE_VERSION} at{" "}
            <a
              className={styles.inlineLink}
              href={`${MERCHANT_REPO}/tree/${MERCHANT_PIN}/${CUSTOMER_EXAMPLE_DIR}`}
            >
              {MERCHANT_REPO}/tree/{MERCHANT_PIN}/{CUSTOMER_EXAMPLE_DIR}
            </a>
            . Needs Node.js 22 and a Git checkout. The default commands show the price and terms first and sign nothing. Inspect and edit <code>fixtures/authorization-batch.json</code> yourself before any{" "}
            <code>--approve</code> purchase. If a payment's outcome is unknown, reconcile it rather than paying again.
          </p>
          <details className={styles.fold}>
            <summary>Steps and commands</summary>
            <ol className={styles.flow}>
              <li>Clone the public merchant and check out the pinned commit.</li>
              <li>Verify <code>node --version</code> reports v22.x, then run <code>npm ci</code>.</li>
              <li>Run <code>npm start</code> for unpaid batch preflight.</li>
              <li>Review the authorization file and set your limit.</li>
              <li>Purchase only with an explicit <code>--approve</code> and a wallet you inject.</li>
              <li>Read every row, including failed and partial ones.</li>
            </ol>
            <div className={styles.commands}>
              <div>
                <span>No-key unpaid preflight</span>
                <pre className={styles.jobPre}><code>{OBSERVE_QUICKSTART}</code></pre>
              </div>
            </div>
          </details>
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
            From the same <code>{CUSTOMER_EXAMPLE_DIR}</code> directory after <code>npm ci</code>. Free and local: name the fields you care about and see exactly what changed between two runs. Rows that only moved are reported as moved, not changed.
          </p>
          <details className={styles.fold}>
            <summary>Steps and commands</summary>
            <div className={styles.commands}>
              <div>
                <span>Copy and run: compare two sample runs</span>
                <pre className={styles.jobPre}><code>{COMPARE_QUICKSTART}</code></pre>
              </div>
            </div>
          </details>
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
          <details className={styles.fold}>
            <summary>Steps and commands</summary>
            <div className={styles.commands}>
              <div>
                <span>Copyable required-field example</span>
                <pre className={styles.jobPre}><code>{RECORD_QUICKSTART}</code></pre>
              </div>
            </div>
          </details>
        </section>

        <section className={styles.section} aria-labelledby="reuse-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Job 4 · opt-in reuse</p>
            <h2 id="reuse-title">Save a result so the next agent can reuse it</h2>
          </div>
          <p className={styles.jobCopy}>
            From a SameDayDesk checkout, preview exactly which fields would be copied into a{" "}
            <code>neomorphic.task-memory.observation.v1</code> reference, then write only with{" "}
            <code>--opt-in</code>. It runs locally and copies only the fields you choose. Private source text, authorizations, receipt secrets and customer identifiers are left out. Failed and incomplete rows remain visible.
            The caller supplies stable task, subject, revision sequence, and current UTC clock values;
            the helper never invents them.
          </p>
          <details className={styles.fold}>
            <summary>Steps and commands</summary>
            <div className={styles.commands}>
              <div>
                <span>Preview, then opt-in write</span>
                <pre className={styles.jobPre}><code>{REUSE_QUICKSTART}</code></pre>
              </div>
            </div>
          </details>
        </section>

        <section className={styles.section} aria-labelledby="record-repeat-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Offline package · source/record repeat</p>
            <h2 id="record-repeat-title">Compare OpenAPI, pricing rows, keyed CSV, or feeds offline</h2>
          </div>
          <p className={styles.jobCopy}>
            Download one portable archive for four source/record families. Free labeled samples and
            next-run manifests run locally. Unsupported HTML and missing identity/units stay explicit.
            Optional existing paid extract stays separate. Details and cold-start commands:{" "}
            <Link className={styles.inlineLink} to="/for-agents/record-repeat">
              /for-agents/record-repeat
            </Link>
            .
          </p>
        </section>

        <section className={styles.section} aria-labelledby="distribution-repair-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Offline package · distribution repair</p>
            <h2 id="distribution-repair-title">Diagnose a listed tool that cannot be acquired or run</h2>
          </div>
          <p className={styles.jobCopy}>
            Download one portable archive that joins caller listing snapshots with a supplied
            baseline/current route pair. Incomplete captures stay explicit. Repair output is owner
            guidance, not lost-customer proof. Details and cold-start commands:{" "}
            <Link className={styles.inlineLink} to="/for-agents/distribution-repair">
              /for-agents/distribution-repair
            </Link>
            .
          </p>
        </section>

        <section className={styles.section} aria-labelledby="consumer-repeat-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Offline package · consumer evidence</p>
            <h2 id="consumer-repeat-title">Run local evidence jobs from a portable package</h2>
          </div>
          <p className={styles.jobCopy}>
            Download one portable archive for local evidence jobs (release brief, table
            reconcile, procurement brief, and related checks). Verify size and sha256 before
            extract. Labeled samples and caller files run offline. You must supply an operator
            clock. Local provenance records the input and result hashes. Details and cold-start
            commands:{" "}
            <Link className={styles.inlineLink} to="/for-agents/consumer-repeat">
              /for-agents/consumer-repeat
            </Link>
            .
          </p>
        </section>

        <section className={styles.section} aria-labelledby="useful-jobs-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Offline package · useful jobs</p>
            <h2 id="useful-jobs-title">Run local useful jobs on files you already hold</h2>
          </div>
          <p className={styles.jobCopy}>
            Archive 1.4.7 contains all ten useful offline jobs: lockfile changes, JSON Schema drift,
            route changes, page changes, pricing snapshots, API upgrades, feed agendas, CI
            evidence, listing repairs, and repeat-job records. Verify size and sha256 before
            extract. Labeled samples need <code>--example</code> except page-change. Ordinary
            callers supply their own files. No purchase or scheduler authority. Details and
            cold-start commands:{" "}
            <Link className={styles.inlineLink} to="/for-agents/useful-jobs">
              /for-agents/useful-jobs
            </Link>
            .
          </p>
        </section>

        <section className={styles.section} aria-labelledby="recurring-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Job 5 · recurring recipes</p>
            <h2 id="recurring-title">Run one-shot page, issue, and buyer-setup jobs against an immutable prior</h2>
          </div>
          <p className={styles.jobCopy}>
            From a SameDayDesk checkout, run <code>source-change-alert</code> or{" "}
            <code>issue-to-work-brief</code> as developer-agent workflows, plus optional{" "}
            <code>buyer-setup-trace</code> for free AgentCash/x402 inspection.
            You supply schedule hint, clock, and sources. Outcomes are unchanged, changed,
            partial, stale baseline, timed out, or error. Priors stay immutable; write a new
            sequenced artifact after review. Partial and failed rows stay visible. <code>buyer-setup-trace</code> shows the payment terms and stops before paying. Offline runs cost nothing; run them on your own schedule.
          </p>
          <details className={styles.fold}>
            <summary>Steps and commands</summary>
            <div className={styles.commands}>
              <div>
                <span>One-run commands (schedule-neutral; see specs/*.recipe.json)</span>
                <pre className={styles.jobPre}><code>{RECURRING_QUICKSTART}</code></pre>
              </div>
              <div>
                <span>Buyer-setup free inspection</span>
                <pre className={styles.jobPre}><code>{BUYER_SETUP_QUICKSTART}</code></pre>
              </div>
            </div>
          </details>
        </section>

        <section className={styles.section} aria-labelledby="official-source-example">
          <div className={styles.sectionHead}>
            <h2 id="official-source-example">How we check official sources</h2>
          </div>
          <p className={styles.jobCopy}>
            We check 16 official pages hourly for changes to IRS forms, state fees, and platform rules.
            Changes open a review task. On November 25, the first run saved 16 baselines.
            The next found all 16 unchanged.
          </p>
          <p className={styles.jobCopy}>
            For the current rule, read{" "}
            <a className={styles.inlineLink} href="https://corp.delaware.gov/alt-entitytaxinstructions/">
              Delaware’s official LLC tax instructions
            </a>{" "}and{" "}
            <a className={styles.inlineLink} href="https://ein.llc/guides/delaware-llc-annual-tax">
              our Delaware LLC annual tax guide
            </a>.
          </p>
        </section>

        <section className={styles.sellerOffer} aria-labelledby="inventory-title">
          <div>
            <p className="eyebrow">Live merchant inventory</p>
            <h2 id="inventory-title">Every paid tool, on the live gateway</h2>
            <p>
              Health, the HTTP catalog, the x402 manifest, OpenAPI, and MCP are the current inventories.
              Choose a fixed-price build from the homepage, or use the tools here per call.
            </p>
            <p>
              {GENTECH_DEFI_RESOLVED_CASE.seller}{" "}
              <code>{GENTECH_DEFI_RESOLVED_CASE.method} {GENTECH_DEFI_RESOLVED_CASE.route}</code>
              {" "}shows a resolved route diagnosis and the repair to use.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primary} to="/x402">
                Other machine services
              </Link>
              <Link className={styles.secondary} to="/x402/seller-conformance">
                Seller audit
              </Link>
              <Link
                className={styles.secondary}
                to={sellerResolvedCasePath(GENTECH_DEFI_RESOLVED_CASE.id)}
              >
                Gentech resolved diagnostic
              </Link>
              <Link className={styles.secondary} to="/x402/verified">
                Inspected route list
              </Link>
            </div>
          </div>
          <div className={styles.offerCard}>
            <span>Use each result well</span>
            <ul>
              <li>Choose a fresh observation or compare files you already hold</li>
              <li>Read the status and evidence on each returned row</li>
              <li>Supply a clock and horizon when checking freshness</li>
              <li>Check the delivered result alongside the payment receipt</li>
              <li>Trace a source label to its linked source</li>
              <li>Keep keys and private URLs in your own environment</li>
              <li>Choose what you share after receiving the result</li>
              <li>Review an export before sharing it</li>
              <li>Keep earlier results when running a recurring recipe</li>
              <li>Reconcile an unknown payment outcome before a new attempt</li>
            </ul>
          </div>
        </section>

        <section className={styles.connect} aria-labelledby="live-title">
          <div>
            <p className="eyebrow">Authoritative inventories</p>
            <h2 id="live-title">Read the current tool inventory</h2>
          </div>
          <details className={styles.fold}>
            <summary>Steps and commands</summary>
            <div className={styles.commands}>
              {LIVE_INVENTORY.map((item) => (
                <div key={item.href}>
                  <span>{item.label}</span>
                  <a href={item.href}>{item.href}</a>
                </div>
              ))}
            </div>
          </details>
        </section>
      </main>
      <Footer />
    </>
  );
}
