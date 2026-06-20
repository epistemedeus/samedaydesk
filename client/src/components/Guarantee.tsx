import styles from "./Guarantee.module.css";

export default function Guarantee() {
  return (
    <section id="guarantee" className={styles.section}>
      <div className="container">
        <div className={styles.card} data-reveal>
          <p className="eyebrow">The guarantee</p>
          <h2 className={styles.title}>
            If you're not happy with the first draft, <span className="lime">you don't pay.</span>
          </h2>
          <p className={styles.body}>
            One free revision on every project. If the work still isn't right for you, we refund 100%.
            No forms, no friction. We'd rather earn a repeat client than keep a dissatisfied one. Payment
            runs through Stripe, so you're protected either way.
          </p>
        </div>
      </div>
    </section>
  );
}
