import { useState, useEffect, useRef, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { track } from "../lib/posthog";
import { READINESS_PAGE } from "../data/readinessPage.mjs";
import { applyMachineMetadata } from "../data/machineEntry.mjs";
import styles from "./AiReadiness.module.css";

import FreeCheckReport from "../components/FreeCheckReport";
import { requestFreeCheck, type FreeCheckResult as Result } from "../lib/freeCheck";

export default function AiReadiness() {
  const carried = (useLocation().state as { readiness?: Result } | null)?.readiness;
  const initial = carried?.version === 2 && typeof carried.url === "string" && typeof carried.score === "number" &&
    typeof carried.grade === "string" && Array.isArray(carried.checks) ? carried : null;
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  // The server shell has no browser history. Restore the actual carried report
  // after hydration so refresh and back navigation keep matching initial HTML.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the carried report after hydration (see above)
    if (initial) { setUrl(initial.url); setResult(initial); }
  }, [initial]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState('');
  useEffect(() => () => controller.current?.abort(), []);
  const location = useLocation();
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('report');
    if (!id) return;
    const ctrl = new AbortController();
    fetch(`/api/tools/ai-readiness?version=2&report=${encodeURIComponent(id)}`, { signal: ctrl.signal })
      .then(async (response) => { const value = await response.json(); if (!response.ok) throw Error(value.error); if (value.version !== 2) throw Error('Unsupported report version.'); setResult(value); setUrl(value.url); })
      .catch((error) => { if (!ctrl.signal.aborted) setErr(error.message); });
    return () => ctrl.abort();
  }, [location.search]);

  // Land the cursor in the URL box on arrival so a visitor can check their site right away.
  // Re-assert across mount + next paint + a short delay so it also wins after the View
  // Transition used by the nav/footer links (which can leave focus on <body> briefly).
  useEffect(() => {
    const focus = () => inputRef.current?.focus({ preventScroll: true });
    focus();
    const raf = requestAnimationFrame(focus);
    const t = window.setTimeout(focus, 80);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, []);

  // The direct shell and browser navigation use the same title, canonical and share metadata.
  useEffect(() => applyMachineMetadata(document, READINESS_PAGE), []);

  async function run(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    track("tool_check_run", { tool: "ai_readiness" });
    try {
      controller.current?.abort();
      controller.current = new AbortController();
      const d = await requestFreeCheck(url.trim(), controller.current.signal, (event) => setProgress(event.detail || (event.status ? `Public fetch: HTTP ${event.status}.` : 'Checking public pages…')));
      setResult(d as Result);
      track("tool_check_done", { tool: "ai_readiness", score: d.score, grade: d.grade });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <header className={styles.head}>
          <p className="eyebrow">Free tool · no signup</p>
          <h1 className={styles.h1}>
            {READINESS_PAGE.headingPrefix} <span className="lime">{READINESS_PAGE.headingHighlight}</span>
          </h1>
          <p className={styles.lead}>
            {READINESS_PAGE.introduction}
          </p>

          <form className={styles.form} onSubmit={run}>
            <input
              ref={inputRef}
              className={styles.input}
              type="text"
              inputMode="url"
              placeholder="yourwebsite.com"
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-label="Website URL"
              autoComplete="off"
            />
            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? "Checking…" : "Check my site"}
            </button>
          </form>
          {loading && <p role="status">{progress || "Starting the free check…"}</p>}
          {err && <p className={styles.err} role="alert">{err}</p>}
        </header>

        {result && <FreeCheckReport report={result} />}

        <section className={styles.faq}>
          <h2 className={styles.faqHead}>How this works</h2>
          <div className={styles.faqItem}>
            <h3>What does the checker actually test?</h3>
            <p>
              It checks public access, initial HTML, business facts, buyer answers, documented agent
              actions and mobile metadata. Every finding includes evidence. Optional capabilities are
              upgrades. Missing field or browser measurements are shown as not verified.
            </p>
          </div>
          <div className={styles.faqItem}>
            <h3>Why does AI-search visibility matter?</h3>
            <p>
              Help search tools read the page your next buyer is looking for. Start with public access,
              clear answers and useful business details. Your report shows the fixes you can make next.
            </p>
          </div>
          <div className={styles.faqItem}>
            <h3>Does llms.txt help me get cited?</h3>
            <p>
              Use llms.txt to give developer tools a short index of your useful pages. Our free
              generator helps you publish it alongside readable pages, structured data and a sitemap.
            </p>
          </div>
          <div className={styles.faqItem}>
            <h3>Is it really free?</h3>
            <p>
              Yes. No signup, no email. The free check covers the technical basics. If you want to know
              whether AI engines actually mention you for the queries your buyers type, that is the paid
              AI-Search Visibility Audit.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
