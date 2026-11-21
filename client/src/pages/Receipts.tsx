import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import StubPage from "./StubPage";
import { callsLabel, monthsOfCalls, receiptId, settledTotal, short, tapeDate, useReceiptFeed, utcTime } from "../lib/receipts";
import styles from "./Receipts.module.css";

// The whole tape. Delivered work first, as full entries; then the paid calls to the gateway, one
// line per month that opens to its days, and a day to its calls: time, what was bought where a
// record says, the paying wallet and the transaction. Built from receiving records and the chain;
// present only once the tape is.
export default function Receipts() {
  const { entries, classes, floor } = useReceiptFeed();
  const delivered = entries.filter((r) => r.kind === "delivered").sort((a, b) => b.date.localeCompare(a.date));
  const settled = entries.filter((r) => r.kind === "settlement");
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
  }, [hash, entries]);
  if (entries.length < floor) return <StubPage title="Not found" note="That page doesn't exist." notFound />;
  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <p className="eyebrow">Receipts · from the ledger</p>
        <h1 className={styles.h1}>Work delivered, and paid for.</h1>
        <p className={styles.lead}>
          {delivered.length} pieces of delivered work, and {settled.length} paid calls to the SameDayDesk gateway
          settled on Base from {classes.distinctWallets} wallets. Every line links its proof. For agents: <a href="/receipts.json">/receipts.json</a>.
        </p>

        <section aria-labelledby="delivered">
          <h2 id="delivered" className={styles.h2}>Delivered work</h2>
          <ol className={styles.work}>
            {delivered.map((r) => (
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
          <h2 id="calls" className={styles.h2}>Paid calls to the SameDayDesk gateway</h2>
          <p className={styles.note}>
            Paid per call over x402, {settledTotal(settled)} in all, each read from Base. Each month opens to its days, and each day to its calls.
          </p>
          {/* Who paid: the counts behind the homepage's roll, with what each class means. */}
          <dl className={styles.legend} aria-label="Who paid">
            <div><dt>{classes.paidCalls}</dt><dd>paid calls, each with its transaction on Base</dd></div>
            <div><dt>{classes.distinctWallets}</dt><dd>paying wallets</dd></div>
            {classes.independent > 0 && <div><dt>{classes.independent}</dt><dd>calls marked <span className={styles.ind}>independent</span></dd></div>}
            {classes.unresolved > 0 && <div><dt>{classes.unresolved}</dt><dd>calls shown by wallet address</dd></div>}
          </dl>
          <ol className={styles.months}>
            {monthsOfCalls(settled).map((m) => (
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
                              <li key={r.proof} className={styles.call}>
                                <span className={styles.time}>{utcTime(r.time)}</span>
                                <span className={styles.callWhat}>
                                  {r.tool ? r.tool.name : "a paid call"}
                                  <span className={styles.wallet}> from {short(r.payer!.address)}</span>
                                  {r.payer!.class === "independent" && <span className={styles.ind}>independent · {r.payer!.label}</span>}
                                </span>
                                <Link to={`/receipts/${receiptId(r)}`} className={styles.callAmount}>{r.amount}</Link>
                                <a href={r.proof} target="_blank" rel="noopener noreferrer" className={styles.tx}>{short(r.chain!.transactionHash)} <span aria-hidden="true">↗</span></a>
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
