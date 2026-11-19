import { useRef, useLayoutEffect, useState } from "react";
import clsx from "clsx";
import { setupGsap, gsap, prefersReducedMotion } from "../motion/gsap";
import AiView from "./AiView";
import styles from "./Proof.module.css";

// A "job ticket" that travels from an existing service to a verified agent-ready path.
// On scroll-in, the connector and acceptance result animate through the established
// SameDayDesk visual system.
export default function Proof() {
  const root = useRef<HTMLElement>(null);
  const [aiView, setAiView] = useState(false);

  useLayoutEffect(() => {
    if (prefersReducedMotion() || !root.current) return;
    setupGsap();
    const ctx = gsap.context(() => {
      const ts = root.current!.querySelector<HTMLElement>("[data-timestamp]");
      const out = root.current!.querySelector<HTMLElement>("[data-step='out']");
      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        scrollTrigger: { trigger: root.current!, start: "top 70%", once: true },
      });
      if (out) tl.from(out, { opacity: 0, x: 24, duration: 0.7 }, 0);
      if (ts) {
        ts.textContent = "...";
        tl.to(ts, { duration: 1.2, scrambleText: { text: "Passed", chars: "PASS0123456789 ", speed: 0.4 } }, 0.5);
      }
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section id="proof" className={styles.section} data-proof ref={root}>
      <div className="container">
        <div className={styles.headRow}>
        <header className={styles.head} data-reveal>
          <p className="eyebrow">Before and after</p>
          <h2 className={styles.title}>
            It is done when <span className="lime">an AI can use it.</span>
          </h2>
        </header>
          <button type="button" className={styles.switch} aria-pressed={aiView} onClick={() => setAiView(!aiView)}>
            <span className={styles.knob} aria-hidden="true" /> What an AI sees
          </button>
        </div>

        {aiView ? <AiView /> : <div className={styles.ticket} data-reveal>
          <div className={styles.col} data-step="in">
            <div className={styles.stamp}><span className={styles.dotMuted} /> Your service today</div>
            <p className={styles.label}>Where it starts</p>
            <p className={clsx(styles.snippet, styles.before)}>
              “Our service works for people. When someone asks ChatGPT to use it, nothing happens.”
            </p>
          </div>

          <div className={styles.arrow} aria-hidden="true">
            <span className={styles.track}><span className={styles.pulse} /></span>
            <span className={styles.arrowhead}>→</span>
          </div>

          <div className={styles.col} data-step="out">
            <div className={clsx(styles.stamp, styles.stampLive)}>
              <span className={styles.dotLive} /> Test · <span className="mono" data-timestamp>Passed</span>
            </div>
            <p className={styles.label}>What gets delivered</p>
            <p className={clsx(styles.snippet, styles.after)}>
              “The assistant finds it, uses it and pays for it, and a test shows it happening.”
            </p>
          </div>
        </div>}

        <p className={styles.foot}>
          <a className="mono lime" href="/receipts">See the receipts</a> of work delivered and paid for
        </p>
      </div>
    </section>
  );
}
