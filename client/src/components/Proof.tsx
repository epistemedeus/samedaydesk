import { useRef, useLayoutEffect } from "react";
import clsx from "clsx";
import { setupGsap, gsap, prefersReducedMotion } from "../motion/gsap";
import styles from "./Proof.module.css";

// Proof-of-speed: the same-day promise made literal. A "job ticket" that travels from
// received → rewritten → delivered. On scroll-in, the connector runs, the rewritten
// line reveals, and the delivery timestamp ScrambleText-races to "Today".
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
        ts.textContent = "—";
        tl.to(ts, { duration: 1.2, scrambleText: { text: "Today", chars: "0123456789:APM ", speed: 0.4 } }, 0.5);
      }
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section id="proof" className={styles.section} data-proof ref={root}>
      <div className="container">
        <header className={styles.head} data-reveal>
          <p className="eyebrow">The same-day promise, made literal</p>
          <h2 className={styles.title}>
            You send it in the morning. <span className="lime">It's done by tonight.</span>
          </h2>
        </header>

        <div className={styles.ticket} data-reveal>
          <div className={styles.col} data-step="in">
            <div className={styles.stamp}><span className={styles.dotMuted} /> Received · 9:14 AM</div>
            <p className={styles.label}>What you send</p>
            <p className={clsx(styles.snippet, styles.before)}>
              “Responsible for answering customer emails and helping customers with their problems.”
            </p>
          </div>

          <div className={styles.arrow} aria-hidden="true">
            <span className={styles.track}><span className={styles.pulse} /></span>
            <span className={styles.arrowhead}>→</span>
          </div>

          <div className={styles.col} data-step="out">
            <div className={clsx(styles.stamp, styles.stampLive)}>
              <span className={styles.dotLive} /> Delivered · <span className="mono" data-timestamp>Today</span>
            </div>
            <p className={styles.label}>What you get back</p>
            <p className={clsx(styles.snippet, styles.after)}>
              “Resolved 60+ daily B2B support conversations at 94% CSAT — 6 points above team average —
              and cut first-response time from 6h to under 2h.”
            </p>
          </div>
        </div>

        <p className={styles.foot}>
          <span className="mono lime">~4 hrs</span> typical turnaround · every order reviewed by a human before it reaches you
        </p>
      </div>
    </section>
  );
}
