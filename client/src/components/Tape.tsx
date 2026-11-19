import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DAYS, DELIVERED, dayLine, receiptId, tapeLine, tapeShown, type Day, type Receipt } from "../lib/receipts";
import styles from "./Tape.module.css";

type Item = { kind: "work"; r: Receipt } | { kind: "day"; d: Day };
const label = (item: Item) => (item.kind === "work" ? tapeLine(item.r) : dayLine(item.d));

// The tape: delivered work first, then the paid calls from AI agents, one entry per day, moving
// slowly under the hero like a teleprinter on one line. It pauses under the pointer, on focus
// or with its button; a click prints a small receipt. With reduced motion it is a still line
// that scrolls sideways.
export default function Tape() {
  const [open, setOpen] = useState<Item | null>(null);
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
  const items: Item[] = [...DELIVERED.map((r) => ({ kind: "work", r }) as Item), ...DAYS.map((d) => ({ kind: "day", d }) as Item)];
  const run = [...items, ...items];
  const same = (a: Item | null, b: Item) => !!a && label(a) === label(b);

  return (
    <section className={styles.band} aria-label="Delivered work and paid calls">
      <span className={styles.cross} aria-hidden="true" />
      <div className={styles.window} data-paused={paused || open ? "true" : undefined}>
        <ul className={styles.track}>
          {run.map((item, i) => (
            <li key={i} aria-hidden={i >= items.length ? "true" : undefined}>
              <button type="button" className={styles.entry} data-kind={item.kind} tabIndex={i >= items.length ? -1 : 0}
                onClick={() => setOpen(same(open, item) ? null : item)} aria-expanded={same(open, item)}>
                <span className={styles.dot} aria-hidden="true" />
                {label(item)}
              </button>
            </li>
          ))}
        </ul>
        <ul className={styles.still}>
          {items.map((item, i) => (
            <li key={i}><button type="button" className={styles.entry} data-kind={item.kind} onClick={() => setOpen(item)}><span className={styles.dot} aria-hidden="true" />{label(item)}</button></li>
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
          <p className="mono">{label(open)}</p>
          {open.kind === "work" ? (
            <>
              <dl>
                <dt>For</dt><dd>{open.r.for}</dd>
                <dt>Received</dt><dd>{open.r.delivered}</dd>
                {open.r.amount && (<><dt>Paid</dt><dd>{open.r.amount} on {open.r.rail}{open.r.paidHow ? `, ${open.r.paidHow}` : ""}</dd></>)}
              </dl>
              <p><Link to={`/receipts/${receiptId(open.r)}`}>The full receipt</Link>
                {" · "}<a href={open.r.proof} target="_blank" rel="noopener noreferrer">See the proof ↗</a></p>
            </>
          ) : (
            <>
              <ul className={styles.calls}>
                {open.d.calls.slice(0, 5).map((r) => (
                  <li key={r.proof}><Link to={`/receipts/${receiptId(r)}`}>{r.amount}</Link><a href={r.proof} target="_blank" rel="noopener noreferrer">Proof ↗</a></li>
                ))}
              </ul>
              <p><Link to={`/receipts#day-${open.d.date}`}>{open.d.calls.length > 5 ? `All ${open.d.calls.length} calls that day` : "On the receipts page"}</Link></p>
            </>
          )}
          <button type="button" className={styles.tuck} onClick={() => setOpen(null)}>Close</button>
        </div>
      )}
    </section>
  );
}
