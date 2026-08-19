import { useSearchParams } from "react-router-dom";
import styles from "./StubPage.module.css";

// The old per-gig checkout is retired. The four current offers are bought from their own
// pay cards, which create a Stripe Checkout Session server side with no account and no
// email verification step. This page exists so old links land somewhere honest.
export default function Checkout() {
  const [params] = useSearchParams();
  const slug = params.get("offer");
  return (
    <main className={styles.wrap}>
      <a href="/" className={styles.back}>
        <span aria-hidden>&#9656;&#9656;</span> SameDayDesk
      </a>
      <h1 className={styles.h1}>That offer is retired</h1>
      <p className={styles.note}>
        {slug ? `The "${slug}" offer is no longer sold. ` : "This checkout path is no longer used. "}
        SameDayDesk now sells one thing: correction of what AI answers say about a business.
        Four prices, each with its own page.
      </p>
      <a href="/#offers" className={styles.home}>See the current prices</a>
    </main>
  );
}
