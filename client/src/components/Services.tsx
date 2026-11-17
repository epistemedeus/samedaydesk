import clsx from "clsx";
import { CATEGORIES, CUSTOM, PAYMENT_LINKS } from "../lib/services";
import MagneticButton from "./MagneticButton";
import { track } from "../lib/posthog";
import styles from "./Services.module.css";

export default function Services() {
  return (
    <section id="services" className={styles.section}>
      <div className="container">
        <header className={styles.head} data-reveal>
          <p className="eyebrow">Agent builds · flat fees</p>
          <h2 className={styles.title}>
            Pick what you need. Fixed price. <span className="lime">Working this week.</span>
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
                {cat.offers.map((o) => (
                  <article key={o.slug} className={clsx(styles.card, o.flagship && styles.flagship)}>
                    {o.flagship && <span className={clsx(styles.badge, styles.badgeLime)}>Best place to start</span>}
                    {o.bestValue && <span className={styles.badge}>Best value</span>}

                    <div className={styles.cardTop}>
                      <div>
                        <h4 className={styles.cardName}>{o.plain}</h4>
                        <p className={clsx("mono", styles.techName)}>{o.name}</p>
                      </div>
                      <div className={styles.price}>
                        <span className={styles.cur}>$</span>
                        <span className={clsx("mono", styles.amount)}>{o.price}</span>
                        {o.per && <span className={styles.cur}>{o.per}</span>}
                      </div>
                    </div>

                    <p className={styles.turn}><span className={styles.dot} aria-hidden="true" /> {o.turnaround}</p>
                    <p className={styles.outcome}>{o.outcome}</p>
                    <p className={styles.example}><span className="mono">For example</span> {o.example}</p>

                    <ul className={styles.includes} aria-label="You receive">
                      {o.receive.map((i) => (
                        <li key={i}><span className={styles.check} aria-hidden="true">›</span> {i}</li>
                      ))}
                    </ul>

                    <details className={styles.tech}>
                      <summary className="mono">Technical details</summary>
                      <p>{o.blurb}</p>
                      <ul>{o.includes.map((i) => <li key={i}>{i}</li>)}</ul>
                    </details>

                    <MagneticButton
                      {...(o.mailto
                        ? { href: o.mailto }
                        : PAYMENT_LINKS[o.slug]
                          ? { href: PAYMENT_LINKS[o.slug] }
                          : { to: `/signup?offer=${o.slug}` })}
                      variant={o.flagship ? "primary" : "ghost"}
                      magnetic={o.flagship}
                      className={styles.cardCta}
                      ariaLabel={o.mailto ? `Ask for ${o.plain}` : `Start ${o.plain} for $${o.price}`}
                      onClick={() => track("offer_selected", { offer: o.slug, price: o.price })}
                    >
                      {o.mailto ? "Ask for it" : `Start · $${o.price}`}
                    </MagneticButton>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className={styles.custom}>
          <div className={styles.customText}>
            <h3 className={styles.customName}>{CUSTOM.name}</h3>
            <p className={styles.customBlurb}>{CUSTOM.blurb}</p>
          </div>
          <MagneticButton
            href={PAYMENT_LINKS.custom_quote}
            variant="ghost"
            onClick={() => track("offer_selected", { offer: "custom_quote" })}
          >
            Tell us the task <span aria-hidden="true">→</span>
          </MagneticButton>
        </div>
      </div>
    </section>
  );
}
