import { useRef, useLayoutEffect } from "react";
import clsx from "clsx";
import MagneticButton from "./MagneticButton";
import EnergySurface from "./EnergySurface";
import { setupGsap, gsap, SplitText, prefersReducedMotion } from "../motion/gsap";
import { track } from "../lib/posthog";
import styles from "./Hero.module.css";

export default function Hero() {
  const root = useRef<HTMLDivElement>(null);
  const h1 = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    if (prefersReducedMotion() || !root.current || !h1.current) return;
    setupGsap();
    const ctx = gsap.context(() => {
      // Velocity headline: split into lines, each masked, snap-in on a soft-settle ease.
      const split = new SplitText(h1.current!, { type: "lines", mask: "lines", linesClass: "h1line" });
      const tl = gsap.timeline({ defaults: { ease: "power4.out" } });
      tl.from(split.lines, { yPercent: 115, duration: 0.95, stagger: 0.12 }, 0)
        .from(root.current!.querySelectorAll("[data-hero-fade]"), { opacity: 0, y: 18, duration: 0.7, stagger: 0.1 }, 0.35);
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section className={styles.hero}>
      <EnergySurface />
      <div className={styles.scrim} aria-hidden="true" />

      <div ref={root} className={clsx("container", styles.content)}>
        <p className={styles.eyebrow} data-hero-fade>
          <span className={styles.tick} aria-hidden="true" /> Same-day · done-for-you desk
        </p>

        <h1 ref={h1} className={styles.h1}>
          <span className={styles.line}>Hand off the busywork.</span>
          <span className={styles.line}>
            Get it back <span className={styles.lime}>today</span>.
          </span>
        </h1>

        <p className={styles.sub} data-hero-fade>
          A same-day desk for the work you don't have time for — résumés, LinkedIn, cover letters,
          landing copy, quick fixes. Sharp humans <span className={styles.plus}>+</span> AI, delivered
          in hours. See the quality <em>free</em>, first.
        </p>

        <div className={styles.ctas} data-hero-fade>
          <MagneticButton
            to="/signup"
            variant="primary"
            magnetic
            ariaLabel="Get my free teaser"
            onClick={() => track("cta_clicked", { where: "hero", action: "teaser" })}
          >
            Get my free teaser <span aria-hidden="true">→</span>
          </MagneticButton>
          <MagneticButton href="#services" variant="ghost">See pricing</MagneticButton>
        </div>

        <ul className={styles.trust} data-hero-fade aria-label="Why SameDayDesk">
          <li><span className={styles.dot} aria-hidden="true" /> Money-back guarantee</li>
          <li><span className={styles.dot} aria-hidden="true" /> Same-day turnaround</li>
          <li><span className={styles.dot} aria-hidden="true" /> Registered US company</li>
        </ul>
      </div>

      <a href="#proof" className={styles.scrollcue} aria-label="See how fast it is">
        <span className="mono">scroll</span>
        <span className={styles.cueline} aria-hidden="true" />
      </a>
    </section>
  );
}
