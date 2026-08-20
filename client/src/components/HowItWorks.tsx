import clsx from "clsx";
import MagneticButton from "./MagneticButton";
import { track } from "../lib/posthog";
import styles from "./HowItWorks.module.css";

const STEPS = [
  {
    n: "01",
    t: "Show us the existing service",
    d: "Send the API docs, repository, or workflow and name the one outcome an agent must be able to complete.",
  },
  {
    n: "02",
    t: "We bind the exact contract",
    d: "We make the request constructible, expose the right discovery surfaces, and wire the payment and evidence path the scope requires.",
  },
  {
    n: "03",
    t: "Run the acceptance test",
    d: "You get source, deployment notes, and a repeatable test showing discovery, the call, the response, and any settlement evidence.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className={styles.section}>
      <div className="container">
        <header className={styles.head}>
          <p className="eyebrow">How it works</p>
          <h2 className={styles.title}>Three steps. <span className="lime">No friction.</span></h2>
        </header>

        <ol className={styles.steps} data-reveal data-reveal-stagger>
          {STEPS.map((s) => (
            <li key={s.n} className={styles.step}>
              <span className={clsx("mono", styles.num)}>{s.n}</span>
              <h3 className={styles.stepTitle}>{s.t}</h3>
              <p className={styles.stepDesc}>{s.d}</p>
            </li>
          ))}
        </ol>

        <div className={styles.cta}>
          <MagneticButton
            to="/signup"
            variant="primary"
            magnetic
            ariaLabel="Get a free route check"
            onClick={() => track("cta_clicked", { where: "how", action: "route_check" })}
          >
            Get a free route check <span aria-hidden="true">→</span>
          </MagneticButton>
          <span className={styles.note}>One route · one failure mode · one useful next step</span>
        </div>
      </div>
    </section>
  );
}
