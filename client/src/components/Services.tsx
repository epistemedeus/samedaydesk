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
          <p className="eyebrow">Pricing · flat fees</p>
          <h2 className={styles.title}>
            Clear scope. Clear price. <span className="lime">Work you can use.</span>
          </h2>
          <p className={styles.lead}>
            Pick a job below, or send us something else entirely. Every order is same-day,
            includes a free revision round, and is money-back if the first draft isn't right.
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
                    {o.flagship && <span className={clsx(styles.badge, styles.badgeLime)}>Most popular</span>}
                    {o.bestValue && <span className={styles.badge}>Best value</span>}

                    <div className={styles.cardTop}>
                      <h4 className={styles.cardName}>{o.name}</h4>
                      <div className={styles.price}>
                        <span className={styles.cur}>$</span>
                        <span className={clsx("mono", styles.amount)}>{o.price}</span>
                      </div>
                    </div>

                    <p className={styles.turn}><span className={styles.dot} aria-hidden="true" /> {o.turnaround}</p>
                    <p className={styles.blurb}>{o.blurb}</p>

                    <ul className={styles.includes}>
                      {o.includes.map((i) => (
                        <li key={i}><span className={styles.check} aria-hidden="true">›</span> {i}</li>
                      ))}
                    </ul>

                    <MagneticButton
                      {...(PAYMENT_LINKS[o.slug]
                        ? { href: PAYMENT_LINKS[o.slug] }
                        : { to: `/signup?offer=${o.slug}` })}
                      variant={o.flagship ? "primary" : "ghost"}
                      magnetic={o.flagship}
                      className={styles.cardCta}
                      ariaLabel={`Start ${o.name} for $${o.price}`}
                      onClick={() => track("offer_selected", { offer: o.slug, price: o.price })}
                    >
                      Start · ${o.price}
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
