import { useEffect } from "react";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import StubPage from "./StubPage";
import { RECEIPTS, tapeDate, tapeShown } from "../lib/receipts";
import styles from "./Legal.module.css";

// Every entry of the tape, in the same style. Built from receiving records; present only
// once the tape is.
export default function Receipts() {
  useEffect(() => {
    const previous = document.title;
    document.title = "Receipts: work delivered and paid | SameDayDesk";
    return () => { document.title = previous; };
  }, []);
  if (!tapeShown()) return <StubPage title="Not found" note="That page doesn't exist." notFound />;
  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <p className="eyebrow">Receipts · from the ledger</p>
        <h1 className={styles.h1}>Work delivered, and paid for.</h1>
        <p className={styles.updated}>Every entry links its proof. Also at <a href="/receipts.json">/receipts.json</a>.</p>
        <div className={styles.body}>
          {RECEIPTS.map((r, i) => (
            <section key={i}>
              <h2>{tapeDate(r.date)} · {r.for}</h2>
              <p>{r.delivered}{r.amount ? `. Paid ${r.amount} on ${r.rail}.` : "."}</p>
              <p><a href={r.proof} target="_blank" rel="noopener noreferrer">Proof ↗</a>{r.more && <> · <a href={r.more} target="_blank" rel="noopener noreferrer">More ↗</a></>}</p>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
