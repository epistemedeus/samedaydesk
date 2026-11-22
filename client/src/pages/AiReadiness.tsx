import { useState, useEffect, useRef, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { track } from "../lib/posthog";
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

  // Per-route SEO: the SPA shell ships the homepage <title>; give the flagship tool page
  // its own title + description so search engines (which render JS) rank it for its query.
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Free AI Readiness Checker: is your site visible to ChatGPT & Perplexity? | SameDayDesk";
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute("content") ?? null;
    meta?.setAttribute(
      "content",
      "Free, no-signup AI readiness checker: see whether AI search engines (ChatGPT, Perplexity, Claude, Google AI) can crawl and understand your website. Scores AI crawler access, JSON-LD, metadata, sitemap and llms.txt, with concrete fixes.",
    );
    return () => {
      document.title = prevTitle;
      if (prevDesc !== null) meta?.setAttribute("content", prevDesc);
    };
  }, []);

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
            Is your site visible to <span className="lime">AI search</span>?
          </h1>
          <p className={styles.lead}>
            ChatGPT, Perplexity, Claude and Google AI are becoming how buyers find things. This free
            check tells you whether AI engines can crawl and understand your site, and what to fix. No
            email required.
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
              AI search referrals are growing fast and answers increasingly come from a small set of
              well-structured, crawlable pages. Public access and clear structure help tools read a page. This check does not prove
              that a search engine has indexed it or will cite it.
            </p>
          </div>
          <div className={styles.faqItem}>
            <h3>Does llms.txt help me get cited?</h3>
            <p>
              Not yet, by the evidence. We flag it because it is cheap, harmless hygiene for developer
              tools, but it has no proven effect on AI citations today. Anyone selling llms.txt as a
              ranking boost is overselling it.
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
