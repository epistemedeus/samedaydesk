import clsx from "clsx";
import MagneticButton from "./MagneticButton";
import { track } from "../lib/posthog";
import styles from "./HowItWorks.module.css";

const STEPS = [
  {
    n: "01",
    t: "Send the task — or claim a free teaser",
    d: "Tell us the role, the job posting, or the page. Attach your current file. Not sure yet? We'll rewrite a piece of it free, today, so you can judge the real quality before paying a cent.",
  },
  {
    n: "02",
    t: "We rewrite it — same day",
    d: "Sharp editorial judgment paired with modern AI tooling. Every deliverable is directed, edited, and quality-checked by a human before it reaches you.",
  },
  {
    n: "03",
    t: "Get editable files + a free revision",
    d: "Delivered as an editable Doc and a clean PDF, usually within hours. Not right? One free revision — and if it's still not for you, money back.",
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
            ariaLabel="Get my free teaser"
            onClick={() => track("cta_clicked", { where: "how", action: "teaser" })}
          >
            Get my free teaser <span aria-hidden="true">→</span>
          </MagneticButton>
          <span className={styles.note}>Free sample first · pay only if you like the direction</span>
        </div>
      </div>
    </section>
  );
}
