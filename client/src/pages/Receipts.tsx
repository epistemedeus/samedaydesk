import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import StubPage from "./StubPage";
import { DELIVERED, MONTHS_OF_CALLS, SETTLED, SETTLED_TOTAL, callsLabel, receiptId, tapeDate, tapeShown } from "../lib/receipts";
import styles from "./Receipts.module.css";

// The whole tape. Delivered work first, as full entries; then the paid calls from AI agents,
// one line per month that opens to its days, and a day to its calls and their proofs. Built from receiving records;
// present only once the tape is.
export default function Receipts() {
  useEffect(() => {
    const previous = document.title;
    document.title = "Receipts: work delivered and paid | SameDayDesk";
    return () => { document.title = previous; };
  }, []);
  // A link to one day (the homepage tape's) opens that day and its month, then brings it into view.
  const { hash } = useLocation();
  useEffect(() => {
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (!target) return;
    for (let el: Element | null = target; el; el = el.parentElement) if (el instanceof HTMLDetailsElement) el.open = true;
    target.querySelector("details")?.setAttribute("open", "");
    target.scrollIntoView({ block: "start" });
  }, [hash]);
  if (!tapeShown()) return <StubPage title="Not found" note="That page doesn't exist." notFound />;
  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <p className="eyebrow">Receipts · from the ledger</p>
        <h1 className={styles.h1}>Work delivered, and paid for.</h1>
        <p className={styles.lead}>
          {DELIVERED.length} pieces of delivered work, and {SETTLED.length} paid calls from AI agents settled on
          Base. Every line links its proof. For agents: <a href="/receipts.json">/receipts.json</a>.
        </p>

        <section aria-labelledby="delivered">
          <h2 id="delivered" className={styles.h2}>Delivered work</h2>
          <ol className={styles.work}>
            {DELIVERED.map((r) => (
              <li key={r.proof} className={styles.job}>
                <span className={styles.date}>{tapeDate(r.date)}</span>
                <div className={styles.what}>
                  <p className={styles.for}><Link to={`/receipts/${receiptId(r)}`}>{r.for}</Link></p>
                  <p className={styles.got}>{r.delivered}</p>
                  {r.amount && <p className={styles.paid}>Paid {r.amount} on {r.rail}{r.paidHow ? `, ${r.paidHow}` : ""}</p>}
                </div>
                <p className={styles.links}>
                  <a href={r.proof} target="_blank" rel="noopener noreferrer">Proof <span aria-hidden="true">↗</span></a>
                  {r.more && <a href={r.more} target="_blank" rel="noopener noreferrer">The work <span aria-hidden="true">↗</span></a>}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="calls">
          <h2 id="calls" className={styles.h2}>Paid calls from AI agents</h2>
          <p className={styles.note}>
            Agents paid the SameDayDesk gateway per call over x402, {SETTLED_TOTAL} in all. Each month opens to its days, and each day to its calls.
          </p>
          <ol className={styles.months}>
            {MONTHS_OF_CALLS.map((m) => (
              <li key={m.month} id={`month-${m.month}`} className={styles.month}>
                <details>
                  <summary>
                    <span className={styles.monthName}>{m.name}</span>
                    <span className={styles.dayWhat}>{callsLabel(m.calls)}</span>
                    <span className={styles.amount}>{m.total}</span>
                    <span className={styles.chev} aria-hidden="true" />
                  </summary>
                  <ol className={styles.days}>
                    {m.days.map((d) => (
                      <li key={d.date} id={`day-${d.date}`} className={styles.day}>
                        <details>
                          <summary>
                            <span className={styles.date}>{tapeDate(d.date)}</span>
                            <span className={styles.dayWhat}>{callsLabel(d.calls.length)}</span>
                            <span className={styles.amount}>{d.total}</span>
                            <span className={styles.chev} aria-hidden="true" />
                          </summary>
                          <ul className={styles.calls}>
                            {d.calls.map((r) => (
                              <li key={r.proof}>
                                <Link to={`/receipts/${receiptId(r)}`}>{r.amount}</Link>
                                <a href={r.proof} target="_blank" rel="noopener noreferrer">Proof <span aria-hidden="true">↗</span></a>
                              </li>
                            ))}
                          </ul>
                        </details>
                      </li>
                    ))}
                  </ol>
                </details>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <Footer />
    </>
  );
}
