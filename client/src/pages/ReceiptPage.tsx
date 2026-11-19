import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import StubPage from "./StubPage";
import { RECEIPTS, tapeShown } from "../lib/receipts";
import { longDate, receiptHeading, receiptId } from "../data/receiptPages.mjs";
import styles from "./ReceiptPage.module.css";

// One entry of the tape on its own page: what was done, for whom (named only where the work
// is public), the amount, and the proof.
export default function ReceiptPage() {
  const { id } = useParams();
  const r = RECEIPTS.find((entry) => receiptId(entry) === id);
  useEffect(() => {
    if (!r) return;
    const previous = document.title;
    document.title = `Receipt ${id} | SameDayDesk`;
    return () => { document.title = previous; };
  }, [r, id]);
  if (!r || !tapeShown()) return <StubPage title="Not found" note="That receipt doesn't exist." notFound />;
  const work = r.kind === "delivered";
  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <p className="eyebrow">Receipt</p>
        <article className={styles.slip}>
          <p className={styles.head}><span>SameDayDesk</span><span>{longDate(r.date)}</span></p>
          <h1 className={styles.h1}>{receiptHeading(r)}</h1>
          <dl className={styles.lines}>
            <div><dt>{work ? "Delivered" : "Received"}</dt><dd>{work ? r.delivered : "An answer from the SameDayDesk gateway"}</dd></div>
            {r.amount && <div><dt>Paid</dt><dd>{r.amount} on {r.rail}{r.paidHow ? `, ${r.paidHow}` : ""}</dd></div>}
          </dl>
          <p className={styles.proof}>
            <span className={styles.ref}>No. {id}</span>
            <a href={r.proof} target="_blank" rel="noopener noreferrer">{r.kind === "settlement" ? "The transaction on Base" : "The proof"} <span aria-hidden="true">↗</span></a>
            {r.more && <a href={r.more} target="_blank" rel="noopener noreferrer">The work itself <span aria-hidden="true">↗</span></a>}
          </p>
        </article>
        <p className={styles.back}><Link to="/receipts">All receipts</Link></p>
      </main>
      <Footer />
    </>
  );
}
