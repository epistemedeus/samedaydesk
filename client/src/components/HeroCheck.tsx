import { useEffect, useRef, useState, type FormEvent } from "react";
import { track } from "../lib/posthog";
import styles from "./HeroCheck.module.css";

import FreeCheckReport from "./FreeCheckReport";
import { requestFreeCheck, type FreeCheckResult as Result } from "../lib/freeCheck";

export function HeroCheckForm({ onResult }: { onResult: (r: Result | null, err: string | null, busy: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function run(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setProgress("Starting the free check…");
    onResult(null, null, true);
    track("tool_check_run", { tool: "ai_readiness", where: "hero" });
    try {
      controller.current?.abort();
      controller.current = new AbortController();
      const d = await requestFreeCheck(url.trim(), controller.current.signal, (event) => setProgress(event.detail || (event.status ? `Public fetch: HTTP ${event.status}.` : 'Checking public pages…')));
      onResult(d as Result, null, false);
      track("tool_check_done", { tool: "ai_readiness", where: "hero", score: d.score, grade: d.grade });
    } catch (e) {
      onResult(null, e instanceof Error ? e.message : "Something went wrong. Try again in a minute.", false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div><form className={styles.form} onSubmit={run} role="search" aria-label="Free check">
      <label className={styles.label} htmlFor="hero-check-url">Free check: can an AI read your site?</label>
      <div className={styles.row}>
        <input id="hero-check-url" className={styles.input} type="text" inputMode="url" placeholder="yourwebsite.com"
          autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className={styles.go} type="submit" disabled={busy}>{busy ? "Checking…" : "Check it free"} <span aria-hidden="true">→</span></button>
      </div>
    </form>{busy && <p role="status" className={styles.label}>{progress}</p>}</div>
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
  return <section ref={box} className={styles.wrap} aria-live="polite"><div className={styles.slip}><FreeCheckReport report={result!} compact /></div></section>;
}
