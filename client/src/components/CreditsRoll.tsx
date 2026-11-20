import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { CLASSES, RECEIPTS, receiptId, short, tapeDate, tapeShown, utcTime, type Receipt } from "../lib/receipts";
import styles from "./CreditsRoll.module.css";

const SPEED = 22; // px per second, upward
const EASE_MS = 400; // the roll eases to a stop, and back, over this long

// The receipts as film credits: a framed screen on the drawing sheet where every entry, delivered
// work and paid calls alike, rolls upward without end. Pointer or keyboard focus eases the roll
// to a stop; the entry under the pointer lifts with the signal rule and offers its receipt while
// the rest dim; leaving resumes from where it stopped. With reduced motion the screen is a still
// list that scrolls.
export default function CreditsRoll() {
  const screen = useRef<HTMLDivElement>(null);
  const reel = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const box = screen.current, track = reel.current, list = first.current;
    if (!box || !track || !list || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let y = 0, v = SPEED, target = SPEED, last = 0, raf = 0, visible = true;
    const tick = (t: number) => {
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      // Approach the target speed linearly, a full stop or start taking EASE_MS.
      const step = (SPEED / EASE_MS) * 1000 * dt;
      v = v < target ? Math.min(target, v + step) : Math.max(target, v - step);
      const loop = list.offsetHeight;
      y = loop ? (y + v * dt) % loop : 0;
      track.style.transform = `translate3d(0, ${-y}px, 0)`;
      raf = visible && !document.hidden ? requestAnimationFrame(tick) : 0;
    };
    const run = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };
    const hold = () => { target = 0; };
    const go = () => { if (!box.contains(document.activeElement)) target = SPEED; };
    // Keyboard focus stops the roll and brings the focused entry into the middle of the screen.
    const focus = (e: FocusEvent) => {
      hold();
      const row = (e.target as HTMLElement).closest("li");
      if (row) y = Math.max(0, row.offsetTop - (box.clientHeight - row.offsetHeight) / 2);
      // The browser scrolls a clipped box to show what takes focus; the roll places it instead.
      box.scrollTop = 0;
    };
    const unscroll = () => { box.scrollTop = 0; };
    const blur = (e: FocusEvent) => { if (!box.contains(e.relatedTarget as Node)) target = SPEED; };
    box.addEventListener("pointerenter", hold);
    box.addEventListener("pointerleave", go);
    box.addEventListener("focusin", focus);
    box.addEventListener("focusout", blur);
    box.addEventListener("scroll", unscroll);
    const seen = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) run(); });
    seen.observe(box);
    const wake = () => { if (!document.hidden) run(); };
    document.addEventListener("visibilitychange", wake);
    run();
    return () => {
      cancelAnimationFrame(raf);
      seen.disconnect();
      document.removeEventListener("visibilitychange", wake);
      box.removeEventListener("pointerenter", hold);
      box.removeEventListener("pointerleave", go);
      box.removeEventListener("focusin", focus);
      box.removeEventListener("focusout", blur);
      box.removeEventListener("scroll", unscroll);
    };
  }, []);

  if (!tapeShown()) return null;
  return (
    <section className={styles.band} aria-labelledby="credits-title">
      <div className={styles.frame}>
        <span className={styles.corner} data-at="tl" aria-hidden="true" />
        <span className={styles.corner} data-at="tr" aria-hidden="true" />
        <header className={styles.head}>
          <h2 id="credits-title" className={styles.title}>Receipts, read from Base</h2>
          <p className={styles.counts}>
            <span><b>{CLASSES.delivered}</b> delivered</span>
            <span><b>{CLASSES.paidCalls}</b> paid calls</span>
            <span><b>{CLASSES.distinctWallets}</b> wallets</span>
            <span><b>{CLASSES.independent}</b> independent</span>
          </p>
        </header>
        <div ref={screen} className={styles.screen}>
          <div ref={reel} className={styles.reel}>
            <ol ref={first} className={styles.list}>
              {RECEIPTS.map((r) => <Entry key={r.proof} r={r} />)}
            </ol>
            <ol className={`${styles.list} ${styles.again}`} aria-hidden="true">
              {RECEIPTS.map((r) => <Entry key={r.proof} r={r} copy />)}
            </ol>
          </div>
        </div>
        <footer className={styles.foot}>
          <span>Our own wallets are left out. Unmarked wallets are shown without a claim about who runs them.</span>
          <Link to="/receipts" className={styles.all}>All receipts <span aria-hidden="true">→</span></Link>
        </footer>
        <span className={styles.corner} data-at="bl" aria-hidden="true" />
        <span className={styles.corner} data-at="br" aria-hidden="true" />
      </div>
    </section>
  );
}

function Entry({ r, copy = false }: { r: Receipt; copy?: boolean }) {
  const call = r.kind === "settlement";
  return (
    <li className={styles.entry} data-kind={call ? "call" : "work"}>
      <Link to={`/receipts/${receiptId(r)}`} tabIndex={copy ? -1 : undefined} className={styles.row}>
        <span className={styles.when}>{tapeDate(r.date)}{r.time ? ` ${utcTime(r.time)}` : ""}</span>
        <span className={styles.kind}>{call ? "Paid call" : "Delivered"}</span>
        <span className={styles.what}>
          {call ? (r.tool ? <><b>{r.tool.name}</b> {r.tool.what}</> : "a call to the gateway") : <><b>{r.for}</b> {r.delivered}</>}
        </span>
        <span className={styles.amount}>{r.amount ?? ""}</span>
        <span className={styles.chain}>
          {call && (
            <>
              <span>from {short(r.payer!.address)}</span>
              {r.payer!.class === "independent" && <span className={styles.ind}>independent · {r.payer!.label}</span>}
              <span>tx {short(r.chain!.transactionHash)} · block {r.chain!.blockNumber.toLocaleString("en-US")}</span>
              {r.chain!.status === "success" && <span className={styles.ok}>✓ verified on Base</span>}
            </>
          )}
        </span>
        <span className={styles.open} aria-hidden="true">Open receipt →</span>
      </Link>
    </li>
  );
}
