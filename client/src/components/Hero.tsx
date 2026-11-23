import { useState } from "react";
import clsx from "clsx";
import EnergySurface from "./EnergySurface";
import { HeroCheckForm, HeroCheckReceipt } from "./HeroCheck";
import styles from "./Hero.module.css";

export default function Hero() {
  const [check, setCheck] = useState<{ result: Parameters<typeof HeroCheckReceipt>[0]["result"]; err: string | null; busy: boolean }>({ result: null, err: null, busy: false });

  return (
    <>
    <section className={styles.hero} data-hero>
      <EnergySurface />
      <div className={styles.scrim} aria-hidden="true" />

      <div className={clsx("container", styles.content)} data-hero-copy>
        <p className={styles.eyebrow} data-hero-fade>
          <span className={styles.tick} aria-hidden="true" /> Agent commerce · built and shipped
        </p>

        <h1 className={styles.h1}>
          <span className={styles.line}>Make your business</span>
          <span className={styles.line}>
            usable by <span className={styles.lime}>AI</span>.
          </span>
        </h1>

        <p className={styles.sub} data-hero-fade>
          When people ask ChatGPT or Claude to book, buy or look something up, your service answers
          and gets paid. Fixed prices. Ready for your customers.
        </p>

        <div data-hero-fade>
          <HeroCheckForm onResult={(result, err, busy) => setCheck({ result, err, busy })} />
          <p className={styles.alt}><a href="#services"><strong>Fixed prices from 149 USD.</strong> See what we build</a></p>
        </div>
        <p className={styles.fine} data-hero-fade>
          For engineers: MCP servers, x402 and MPP payment routes, and machine storefronts, built
          on the service you already run, with the tests that prove them.
        </p>

      </div>

      <a href="#proof" className={styles.scrollcue} aria-label="See what gets delivered">
        <span className="mono">scroll</span>
        <span className={styles.cueline} aria-hidden="true" />
      </a>
    </section>
    <HeroCheckReceipt {...check} />
    </>
  );
}
