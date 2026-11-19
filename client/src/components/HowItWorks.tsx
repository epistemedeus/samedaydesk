import clsx from "clsx";
import MagneticButton from "./MagneticButton";
import { track } from "../lib/posthog";
import styles from "./HowItWorks.module.css";

const STEPS = [
  {
    n: "01",
    t: "Show us what you have",
    d: "Your website, your app or the job your team does by hand, and the one thing AI should be able to do with it.",
    tech: "Send the API docs, repository or workflow, and name the outcome an agent must complete.",
  },
  {
    n: "02",
    t: "We make it work with AI",
    d: "Assistants can find it, use it and, where you charge, pay for it.",
    tech: "We make the request constructible, publish the discovery files, and wire the payment route the scope needs.",
  },
  {
    n: "03",
    t: "You get it running",
    d: "Working on your service, with the code to keep and the test that proves it.",
    tech: "A repeatable test covers discovery, the call, the response and, where paid, the settlement receipt.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className={styles.section}>
      <div className="container">
        <header className={styles.head}>
          <p className="eyebrow">How it works</p>
          <h2 className={styles.title}>Show us. We build it. <span className="lime">You run it.</span></h2>
        </header>

        <ol className={styles.steps} data-reveal data-reveal-stagger>
          {STEPS.map((s) => (
            <li key={s.n} className={styles.step}>
              <span className={clsx("mono", styles.num)}>{s.n}</span>
              <h3 className={styles.stepTitle}>{s.t}</h3>
              <p className={styles.stepDesc}>{s.d}</p>
              <details className={styles.stepTech}>
                <summary className="mono">Technical detail</summary>
                <p>{s.tech}</p>
              </details>
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
          <span className={styles.note}>Free: we check one part of your service and tell you what it needs.</span>
        </div>
      </div>
    </section>
  );
}
