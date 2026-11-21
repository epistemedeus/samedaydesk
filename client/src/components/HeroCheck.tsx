import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PAYMENT_LINKS, ALL_OFFERS } from "../lib/services";
import { track } from "../lib/posthog";
import styles from "./HeroCheck.module.css";

type Check = { id: string; label: string; status: "pass" | "warn" | "fail"; detail: string; fix: string | null };
type Result = { url: string; score: number; grade: string; checks: Check[]; checkedAt: string };

const offer = (slug: string) => ALL_OFFERS.find((o) => o.slug === slug)!;

// The free check, in the hero: paste a website, the existing AI-readiness checker runs
// (/api/tools/ai-readiness), and the result prints as a receipt below the hero with one next
// step. Anything to fix leads to the front-door line; a clean result leads to the app inside
// ChatGPT and Claude.
export function HeroCheckForm({ onResult }: { onResult: (r: Result | null, err: string | null, busy: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    onResult(null, null, true);
    track("tool_check_run", { tool: "ai_readiness", where: "hero" });
    try {
      const r = await fetch(`/api/tools/ai-readiness?url=${encodeURIComponent(url.trim())}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "We could not reach that site. Check the address and try again.");
      onResult(d as Result, null, false);
      track("tool_check_done", { tool: "ai_readiness", where: "hero", score: d.score, grade: d.grade });
    } catch (e) {
      onResult(null, e instanceof Error ? e.message : "Something went wrong. Try again in a minute.", false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={styles.form} onSubmit={run} role="search" aria-label="Free check">
      <label className={styles.label} htmlFor="hero-check-url">Free check: can an AI read your site?</label>
      <div className={styles.row}>
        <input id="hero-check-url" className={styles.input} type="text" inputMode="url" placeholder="yourwebsite.com"
          autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className={styles.go} type="submit" disabled={busy}>{busy ? "Checking…" : "Check it free"} <span aria-hidden="true">→</span></button>
      </div>
    </form>
  );
}

export function HeroCheckReceipt({ result, err, busy }: { result: Result | null; err: string | null; busy: boolean }) {
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    if ((result || err) && box.current) box.current.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  }, [result, err]);
  if (!result && !err && !busy) return null;
  if (busy) return <section ref={box} className={styles.wrap} aria-live="polite"><div className={`${styles.slip} ${styles.printing}`}><p className="mono">Checking the site the way an AI assistant reads it…</p></div></section>;
  if (err) return <section ref={box} className={styles.wrap} aria-live="polite"><div className={styles.slip}><p className={styles.err} role="alert">{err}</p></div></section>;
  const r = result!;
  const open = r.checks.filter((c) => c.status !== "pass").sort((a, b) => (a.status === "fail" ? -1 : 1) - (b.status === "fail" ? -1 : 1));
  const next = offer(open.length ? "agent_front_door" : "agent_mcp_server");
  const host = r.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <section ref={box} className={styles.wrap} aria-live="polite" aria-label="Your free check">
      <div className={styles.slip}>
        <p className={styles.head}><span className="mono">Free check</span><span className="mono">{new Date(r.checkedAt).toISOString().slice(0, 16).replace("T", " ")} UTC</span></p>
        <p className={styles.site}>{host}</p>
        <p className={styles.score}><span className="mono">{r.score}</span><span className={styles.of}>/100 · grade {r.grade}</span></p>
        <ul className={styles.lines}>
          {(open.length ? open.slice(0, 3) : r.checks.slice(0, 3)).map((c) => (
            <li key={c.id} data-status={c.status}>
              <span className={styles.mark} aria-hidden="true">{c.status === "pass" ? "✓" : c.status === "warn" ? "!" : "✕"}</span>
              <span><strong>{c.label}</strong>{c.fix ? ` ${c.fix}` : ` ${c.detail}`}</span>
            </li>
          ))}
        </ul>
        {open.length > 3 && <p className={styles.more}>And {open.length - 3} more. <Link to="/tools/ai-readiness" state={{ readiness: r }}>Every check</Link></p>}
        <div className={styles.next}>
          <p>{open.length ? "The next step: one line that tells every AI how to use your service." : "AI can read your site. The next step: your service inside ChatGPT and Claude."}</p>
          <a className={styles.buy} href={PAYMENT_LINKS[next.slug]} onClick={() => track("offer_selected", { offer: next.slug, price: next.price, where: "hero_check" })}>
            {next.plain} · {next.price} USD <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}
