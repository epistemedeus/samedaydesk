import styles from "./Guarantee.module.css";

export default function Guarantee() {
  return (
    <section id="guarantee" className={styles.section}>
      <div className="container">
        <div className={styles.card} data-reveal>
          <p className="eyebrow">The guarantee</p>
          <h2 className={styles.title}>
            The promised path passes, <span className="lime">or we keep fixing it.</span>
          </h2>
          <p className={styles.body}>
            Every scope names the acceptance checks before work starts. If our delivered code does not pass
            those checks in the agreed environment, we repair it at no additional charge. If we cannot make
            the scoped path pass, we refund the build. Payment runs through Stripe.
          </p>
        </div>
      </div>
    </section>
  );
}
