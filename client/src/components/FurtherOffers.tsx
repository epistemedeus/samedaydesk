import styles from "./FurtherOffers.module.css";

// The three additions (spec 10.1), shown at the sitting before release.
const OFFERS = [
  { id: "front_door", name: "Agent Front Door", price: "$249", time: "1 to 2 days", body: "A start file, a quick start block, llms.txt, discovery links, and a test in which a fresh agent completes one named action on your site.", test: "A fresh agent, given one sentence, completes the named action." },
  { id: "keep_working", name: "Keep it working", price: "$100 a month", time: "Monthly", body: "One workflow in one environment: one later check and one bounded correction each month.", test: "The monthly check passes, or the correction is made." },
  { id: "crawler_check", name: "Crawler access check", price: "Free", time: "Instant", body: "Nine declared AI crawler identities against the paths your robots.txt allows: what was served and what was refused.", test: "Part of the free check above." },
];

export default function FurtherOffers() {
  return (
    <section className={styles.section} aria-labelledby="more-h">
      <div className="container">
        <p className="eyebrow">Also from the shop</p>
        <h2 id="more-h" className={styles.title}>Smaller jobs, same rules.</h2>
        <div className={styles.grid}>
          {OFFERS.map((o) => (
            <article key={o.id} className={styles.card}>
              <div className={styles.top}>
                <h3>{o.name}</h3>
                <p className={styles.price}>{o.price}<span>{o.time}</span></p>
              </div>
              <p>{o.body}</p>
              <p className={styles.test}><b>Test</b> {o.test}</p>
            </article>
          ))}
        </div>
        <p className={styles.note}>Ask for any of these at <a href="mailto:contact@samedaydesk.com">contact@samedaydesk.com</a>. Ordering opens after review.</p>
      </div>
    </section>
  );
}
