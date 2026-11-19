import { useEffect } from "react";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import StubPage from "./StubPage";
import { RECEIPTS, tapeDate, tapeShown } from "../lib/receipts";
import styles from "./Receipts.module.css";

// Every entry of the tape, in the same style. Built from receiving records; present only
// once the tape is.
export default function Receipts() {
  useEffect(() => {
    const previous = document.title;
    document.title = "Receipts: work delivered and paid | SameDayDesk";
    return () => { document.title = previous; };
  }, []);
  if (!tapeShown()) return <StubPage title="Not found" note="That page doesn't exist." notFound />;
  const settled = RECEIPTS.filter((r) => r.kind === "settlement");
  const delivered = RECEIPTS.filter((r) => r.kind === "delivered");
  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <p className="eyebrow">Receipts · from the ledger</p>
        <h1 className={styles.h1}>Work delivered, and paid for.</h1>
        <p className={styles.lead}>
          {settled.length} paid calls settled on Base by the agents that made them, and {delivered.length} pieces
          of delivered work. Every line links its proof. For agents: <a href="/receipts.json">/receipts.json</a>.
        </p>
        <ol className={styles.ledger}>
          {RECEIPTS.map((r, i) => (
            <li key={i} className={styles.line}>
              <span className={styles.date}>{tapeDate(r.date)}</span>
              <span className={styles.what}>
                <span className={styles.for}>{r.for}</span>
                <span className={styles.got}>{r.delivered}</span>
              </span>
              <span className={styles.amount}>{r.amount ? `${r.amount}` : ""}</span>
              <a className={styles.proof} href={r.proof} target="_blank" rel="noopener noreferrer">Proof <span aria-hidden="true">↗</span></a>
            </li>
          ))}
        </ol>
      </main>
      <Footer />
    </>
  );
}
