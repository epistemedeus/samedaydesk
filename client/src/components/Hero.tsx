import clsx from "clsx";
import MagneticButton from "./MagneticButton";
import EnergySurface from "./EnergySurface";
import { track } from "../lib/posthog";
import styles from "./Hero.module.css";

export default function Hero() {
  return (
    <section className={styles.hero}>
      <EnergySurface />
      <div className={styles.scrim} aria-hidden="true" />

      <div className={clsx("container", styles.content)}>
        <p className={styles.eyebrow}>
          <span className={styles.tick} aria-hidden="true" /> Same-day · done-for-you desk
        </p>

        <h1 className={styles.h1} data-velocity>
          <span className={styles.line}>Hand off the busywork.</span>
          <span className={styles.line}>
            Get it back <span className={styles.lime}>today</span>.
          </span>
        </h1>

        <p className={styles.sub}>
          A same-day desk for the work you don't have time for — résumés, LinkedIn, cover letters,
          landing copy, quick fixes. Sharp humans <span className={styles.plus}>+</span> AI, delivered
          in hours. See the quality <em>free</em>, first.
        </p>

        <div className={styles.ctas}>
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

        <ul className={styles.trust} aria-label="Why SameDayDesk">
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
