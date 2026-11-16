import { useEffect, useRef, useState } from "react";
import { WIRE, WIRE_DATE, WIRE_SOURCE } from "../data/wire";
import styles from "./Wire.module.css";

// Signature: a real 402 exchange plays beside the headline. Every frame is in
// the markup; motion only steps a highlight through them. Loops slowly, stops
// off screen, and has a pause control. Reduced motion shows all four at rest.
const STEP_MS = 2600;

export default function Wire() {
  const [moving] = useState(() => typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [step, setStep] = useState(moving ? 0 : WIRE.length - 1);
  const [paused, setPaused] = useState(false);
  const root = useRef<HTMLElement>(null);
  const visible = useRef(true);

  useEffect(() => {
    if (!moving) return;
    const io = new IntersectionObserver((e) => { visible.current = e[0].isIntersecting; });
    if (root.current) io.observe(root.current);
    return () => io.disconnect();
  }, [moving]);

  useEffect(() => {
    if (!moving || paused) return;
    const id = window.setInterval(() => {
      if (visible.current && !document.hidden) setStep((s) => (s + 1) % WIRE.length);
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [moving, paused]);

  return (
    <figure ref={root} className={styles.wire} data-moving={moving || undefined} aria-label="A real paid request on the SameDayDesk gateway">
      <div className={styles.head}>
        <span className={styles.dot} aria-hidden="true" />
        <span>agents.samedaydesk.com</span>
        {moving && (
          <button type="button" className={styles.pause} aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
            {paused ? "Play" : "Pause"}
          </button>
        )}
      </div>
      <ol className={styles.frames}>
        {WIRE.map((f, i) => (
          <li key={f.id} className={styles.frame} data-on={!moving || i <= step || undefined} data-current={moving && i === step || undefined}>
            <p className={styles.who}><span>{f.who}</span><b>{f.label}</b></p>
            <pre className={styles.code}>{f.lines.join("\n")}</pre>
          </li>
        ))}
      </ol>
      <figcaption className={styles.cap}>
        A settlement of {WIRE_DATE}, payer shortened. <a href={WIRE_SOURCE}>Read the record</a>
      </figcaption>
    </figure>
  );
}
