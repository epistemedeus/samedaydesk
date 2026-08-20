import { useRef, useLayoutEffect } from "react";
import clsx from "clsx";
import { setupGsap, gsap, prefersReducedMotion } from "../motion/gsap";
import styles from "./Proof.module.css";

// A "job ticket" that travels from an existing service to a verified agent-ready path.
// On scroll-in, the connector and acceptance result animate through the established
// SameDayDesk visual system.
export default function Proof() {
  const root = useRef<HTMLElement>(null);

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
        <header className={styles.head} data-reveal>
          <p className="eyebrow">From working API to agent-ready service</p>
          <h2 className={styles.title}>
            The build is not done until <span className="lime">an agent can use it.</span>
          </h2>
        </header>

        <div className={styles.ticket} data-reveal>
          <div className={styles.col} data-step="in">
            <div className={styles.stamp}><span className={styles.dotMuted} /> Existing service</div>
            <p className={styles.label}>Where it starts</p>
            <p className={clsx(styles.snippet, styles.before)}>
              “The API works, but an agent cannot discover the right operation, construct the call, or pay for it.”
            </p>
          </div>

          <div className={styles.arrow} aria-hidden="true">
            <span className={styles.track}><span className={styles.pulse} /></span>
            <span className={styles.arrowhead}>→</span>
          </div>

          <div className={styles.col} data-step="out">
            <div className={clsx(styles.stamp, styles.stampLive)}>
              <span className={styles.dotLive} /> Acceptance · <span className="mono" data-timestamp>Passed</span>
            </div>
            <p className={styles.label}>What gets delivered</p>
            <p className={clsx(styles.snippet, styles.after)}>
              “Published discovery, callable examples, exact payment terms, and a test that proves the result and receipt.”
            </p>
          </div>
        </div>

        <p className={styles.foot}>
          <span className="mono lime">Working evidence</span> ships with every build
        </p>
      </div>
    </section>
  );
}
