import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { RECEIPTS, tapeLine, tapeShown, type Receipt } from "../lib/receipts";
import styles from "./Tape.module.css";

// The tape: real settlements and delivered work, moving slowly under the hero like a
// teleprinter. It pauses under the pointer, on focus or with its button; a click prints a
// small receipt. With reduced motion it is a still row of the six latest entries.
export default function Tape() {
  const [open, setOpen] = useState<Receipt | null>(null);
  const [paused, setPaused] = useState(false);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    addEventListener("keydown", close);
    card.current?.focus();
    return () => removeEventListener("keydown", close);
  }, [open]);

  if (!tapeShown()) return null;
  const run = [...RECEIPTS, ...RECEIPTS];

  return (
    <section className={styles.band} aria-label="Recent settlements and delivered work">
      <span className={styles.cross} aria-hidden="true" />
      <div className={styles.window} data-paused={paused || open ? "true" : undefined}>
        <ul className={styles.track}>
          {run.map((r, i) => (
            <li key={i} aria-hidden={i >= RECEIPTS.length ? "true" : undefined}>
              <button type="button" className={styles.entry} tabIndex={i >= RECEIPTS.length ? -1 : 0}
                onClick={() => setOpen(open === r ? null : r)} aria-expanded={open === r}>
                <span className={styles.dot} aria-hidden="true" />
                {tapeLine(r)}
              </button>
            </li>
          ))}
        </ul>
        <ul className={styles.still}>
          {RECEIPTS.slice(0, 6).map((r, i) => (
            <li key={i}><button type="button" className={styles.entry} onClick={() => setOpen(r)}><span className={styles.dot} aria-hidden="true" />{tapeLine(r)}</button></li>
          ))}
        </ul>
      </div>
      <div className={styles.controls}>
        <button type="button" className={styles.pause} onClick={() => setPaused(!paused)} aria-pressed={paused}>
          {paused ? "Play" : "Pause"}
        </button>
        <Link to="/receipts" className={styles.all}>See all</Link>
      </div>
      <span className={styles.cross} aria-hidden="true" />

      {open && (
        <div ref={card} className={styles.receipt} role="dialog" aria-label="Receipt" tabIndex={-1}>
          <p className="mono">{tapeLine(open)}</p>
          <dl>
            <dt>For</dt><dd>{open.for}</dd>
            <dt>Received</dt><dd>{open.delivered}</dd>
            {open.amount && (<><dt>Paid</dt><dd>{open.amount} on {open.rail}{open.paidHow ? `, ${open.paidHow}` : ""}</dd></>)}
          </dl>
          <p><a href={open.proof} target="_blank" rel="noopener noreferrer">See the proof ↗</a>
            {open.more && <> · <a href={open.more} target="_blank" rel="noopener noreferrer">The customer&apos;s own words ↗</a></>}</p>
          <button type="button" className={styles.tuck} onClick={() => setOpen(null)}>Close</button>
        </div>
      )}
    </section>
  );
}
