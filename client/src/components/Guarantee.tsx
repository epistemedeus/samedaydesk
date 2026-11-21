import styles from "./Guarantee.module.css";

export default function Guarantee() {
  return (
    <section id="guarantee" className={styles.section}>
      <div className="container">
        <div className={styles.card} data-reveal>
          <p className="eyebrow">The guarantee</p>
          <h2 className={styles.title}>
            It works as promised, <span className="lime">or we keep fixing it.</span>
          </h2>
          <p className={styles.body}>
            Before we start, we write down what must work. If what we deliver does not do it, we fix it at
            no extra charge. If we cannot make it work, you get your money back. Payment runs through
            Stripe.
          </p>
        </div>
      </div>
    </section>
  );
}
