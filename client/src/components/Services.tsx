import clsx from "clsx";
import { CATEGORIES, CUSTOM, PAYMENT_LINKS } from "../lib/services";
import MagneticButton from "./MagneticButton";
import TaskForm from "./TaskForm";
import { track } from "../lib/posthog";
import styles from "./Services.module.css";

export default function Services() {
  return (
    <section id="services" className={styles.section}>
      <div className="container">
        <header className={styles.head} data-reveal>
          <p className="eyebrow">Agent builds · flat fees</p>
          <h2 className={styles.title}>
            Pick what you need. <span className="lime">One fixed price.</span>
          </h2>
          <p className={styles.lead}>
            Each one starts from the service you already have. You get it working, the code to keep,
            and if it does not work as promised, we keep fixing it.
          </p>
        </header>

        <div className={styles.cats}>
          {CATEGORIES.map((cat) => (
            <div key={cat.id} className={styles.cat}>
              <div className={styles.catHead}>
                <h3 className={styles.catLabel}>{cat.label}</h3>
                <span className={styles.catTag}>{cat.tagline}</span>
              </div>

              <div className={styles.cards} data-reveal data-reveal-stagger>
                {cat.offers.map((o) => {
                  const href = PAYMENT_LINKS[o.slug];
                  const go = href ? { href } : { to: `/signup?offer=${o.slug}` };
                  const pick = () => track("offer_selected", { offer: o.slug, price: o.price });
                  return (
                    <article key={o.slug} className={clsx(styles.card, o.flagship && styles.flagship)}>
                      {o.flagship && <span className={clsx(styles.badge, styles.badgeLime)}>Best place to start</span>}
                      {o.bestValue && <span className={styles.badge}>Best value</span>}

                      <div className={styles.cardTop}>
                        <h4 className={styles.cardName}>
                          {/* The name's link covers the card: the whole card is the hit area. */}
                          <a className={styles.cover} href={href || `/signup?offer=${o.slug}`} onClick={pick}>{o.plain}</a>
                        </h4>
                        <div className={styles.price}>
                          <span className={styles.cur}>$</span>
                          <span className={clsx("mono", styles.amount)}>{o.price}</span>
                          {o.per && <span className={styles.cur}>{o.per}</span>}
                        </div>
                      </div>

                      <p className={styles.outcome}>{o.outcome}</p>
                      <p className={styles.scene}>{o.scene}</p>

                      <ul className={styles.includes} aria-label="You receive">
                        {o.receive.map((i) => (
                          <li key={i}><span className={styles.check} aria-hidden="true">›</span> {i}</li>
                        ))}
                      </ul>

                      <details className={styles.tech}>
                        <summary className="mono">Technical details · {o.name}</summary>
                        <p>{o.blurb}</p>
                        <ul>{o.includes.map((i) => <li key={i}>{i}</li>)}</ul>
                      </details>

                      <MagneticButton
                        {...go}
                        variant={o.flagship ? "primary" : "ghost"}
                        magnetic={o.flagship}
                        className={styles.cardCta}
                        ariaLabel={`Buy ${o.plain} for $${o.price}${o.per ? " a month" : ""}`}
                        onClick={pick}
                      >
                        {o.per ? `Start · $${o.price}${o.per}` : `Buy · $${o.price}`} <span aria-hidden="true">→</span>
                      </MagneticButton>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div id="task" className={styles.custom}>
          <div className={styles.customText}>
            <h3 className={styles.customName}>{CUSTOM.name}</h3>
            <p className={styles.customBlurb}>{CUSTOM.blurb}</p>
          </div>
          <TaskForm />
        </div>
      </div>
    </section>
  );
}
