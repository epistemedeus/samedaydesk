import { useEffect, useRef, useState } from "react";
import styles from "./AgentReadyScene.module.css";

// From API to agent-ready, in one pinned scene: a plain API description gains
// a discovery file, a callable example, payment terms and a test, step by
// step; each step's acceptance check passes as it arrives. Still and reduced
// motion: the finished file with every check passed.
const STEPS = [
  { id: "api", title: "A plain API", check: "GET /quote returns JSON", lines: ["openapi: 3.1.0", "paths:", "  /quote:", "    get: { summary: Price a shipment }"] },
  { id: "discover", title: "A discovery file", check: "llms.txt and the API catalog list /quote", lines: ["# /llms.txt", "- [Quote](/openapi.json#/paths/~1quote): price a shipment"] },
  { id: "example", title: "A callable example", check: "A fresh agent calls the example as written", lines: ["curl 'https://api.example.com/quote?from=LIS&to=NYC'"] },
  { id: "pay", title: "Payment terms", check: "Unpaid call: 402 with exact terms. Paid: 200 and a receipt", lines: ["402 accepts: exact · eip155:8453 · 0.02 USDC"] },
  { id: "test", title: "The test", check: "The acceptance suite passes in your environment", lines: ["npm test  ✓ 6 passing"] },
];

export default function AgentReadyScene() {
  const [armed] = useState(() => typeof window !== "undefined" && "IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [step, setStep] = useState(armed ? 1 : STEPS.length);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (!armed) return;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.step));
    }), { rootMargin: "-45% 0px -45% 0px" });
    refs.current.forEach((r) => r && io.observe(r));
    return () => io.disconnect();
  }, [armed]);

  return (
    <section className={styles.section} aria-labelledby="ready-h">
      <div className={`container ${styles.grid}`}>
        <div className={styles.stage}>
          <p className="eyebrow">What a build adds</p>
          <h2 id="ready-h" className={styles.title}>From API to agent-ready.</h2>
          <pre className={styles.file} data-armed={armed || undefined}>
            {STEPS.map((s, i) => (
              <span key={s.id} className={styles.block} data-on={i < step || undefined}>{s.lines.join("\n") + "\n\n"}</span>
            ))}
          </pre>
        </div>
        <ol className={styles.steps}>
          {STEPS.map((s, i) => (
            <li key={s.id} ref={(el) => { refs.current[i] = el; }} data-step={i + 1} className={styles.step} data-on={i < step || undefined}>
              <span className={styles.num}>{String(i + 1).padStart(2, "0")}</span>
              <h3>{s.title}</h3>
              <p className={styles.check}><span aria-hidden="true">{i < step ? "✓" : "·"}</span> {s.check}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
