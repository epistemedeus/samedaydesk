import { useState } from "react";
import { CATEGORIES, CUSTOM, PAYMENT_LINKS } from "../lib/services";
import { track } from "../lib/posthog";
import styles from "./BuildsTable.module.css";

// The four builds as one comparison: scope, time, price, acceptance test.
// The column under the cursor lights; on a phone the columns become cards
// that swipe. Every figure is in the markup.
const BUILDS = CATEGORIES.flatMap((c) => c.offers);

export default function BuildsTable() {
  const [col, setCol] = useState<number | null>(null);
  const start = (slug: string, price: number) => track("offer_selected", { offer: slug, price });
  return (
    <section id="services" className={styles.section} aria-labelledby="builds-h">
      <div className="container">
        <p className="eyebrow">Agent builds · flat fees</p>
        <h2 id="builds-h" className={styles.title}>Four builds. One table.</h2>
        <p className={styles.lead}>Each build has a bounded scope, a delivery time, a fixed price and the test it must pass. If the test does not pass, we repair it; if it cannot pass, we refund it.</p>
        <div className={styles.scroller} onMouseLeave={() => setCol(null)}>
          <table className={styles.table}>
            <caption className="visually-hidden">The four builds compared</caption>
            <thead>
              <tr>
                <td />
                {BUILDS.map((b, i) => (
                  <th key={b.slug} scope="col" data-col={col === i || undefined} onMouseEnter={() => setCol(i)} style={{ viewTransitionName: `build-${b.slug}` } as React.CSSProperties}>
                    {b.flagship && <span className={styles.flag}>Best place to start</span>}
                    {b.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr><th scope="row">Price</th>{BUILDS.map((b, i) => <td key={b.slug} data-col={col === i || undefined} onMouseEnter={() => setCol(i)} className={styles.price}>${b.price}</td>)}</tr>
              <tr><th scope="row">Time</th>{BUILDS.map((b, i) => <td key={b.slug} data-col={col === i || undefined} onMouseEnter={() => setCol(i)}>{b.turnaround}</td>)}</tr>
              <tr><th scope="row">Scope</th>{BUILDS.map((b, i) => <td key={b.slug} data-col={col === i || undefined} onMouseEnter={() => setCol(i)}><ul>{b.includes.map((x) => <li key={x}>{x}</li>)}</ul></td>)}</tr>
              <tr><th scope="row">Acceptance test</th>{BUILDS.map((b, i) => <td key={b.slug} data-col={col === i || undefined} onMouseEnter={() => setCol(i)} className={styles.acc}>{b.acceptance}</td>)}</tr>
              <tr><th scope="row"><span className="visually-hidden">Order</span></th>{BUILDS.map((b, i) => (
                <td key={b.slug} data-col={col === i || undefined} onMouseEnter={() => setCol(i)}>
                  <a className={styles.cta} data-primary={b.flagship || undefined} href={PAYMENT_LINKS[b.slug] ?? `/signup?offer=${b.slug}`} onClick={() => start(b.slug, b.price)} aria-label={`Start ${b.name} for $${b.price}`}>Start · ${b.price}</a>
                </td>
              ))}</tr>
            </tbody>
          </table>
        </div>
        <ul className={styles.cards} aria-label="The four builds">
          {BUILDS.map((b) => (
            <li key={b.slug} className={styles.card}>
              <p className={styles.cardName}>{b.name}</p>
              <p className={styles.price}>${b.price} <span>{b.turnaround}</span></p>
              <ul>{b.includes.map((x) => <li key={x}>{x}</li>)}</ul>
              <p className={styles.acc}><b>Test:</b> {b.acceptance}</p>
              <a className={styles.cta} data-primary={b.flagship || undefined} href={PAYMENT_LINKS[b.slug] ?? `/signup?offer=${b.slug}`} onClick={() => start(b.slug, b.price)}>Start · ${b.price}</a>
            </li>
          ))}
        </ul>
        <p className={styles.custom}>{CUSTOM.name} {CUSTOM.blurb} <a href={PAYMENT_LINKS.custom_quote ?? "/signup?offer=custom_quote"}>Ask for a quote</a></p>
      </div>
    </section>
  );
}
