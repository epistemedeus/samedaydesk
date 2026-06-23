import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { track } from "../lib/posthog";
import styles from "./AiReadiness.module.css";

type Check = { id: string; label: string; status: "pass" | "warn" | "fail"; detail: string; fix: string | null };
type Result = {
  url: string;
  score: number;
  grade: string;
  summary: { wordsOnHomepage: number; lang: string | null; canonical: string | null; h1: string | null };
  checks: Check[];
  checkedAt: string;
};

const STATUS_ICON: Record<Check["status"], string> = { pass: "✓", warn: "!", fail: "✕" };

export default function AiReadiness() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    track("tool_check_run", { tool: "ai_readiness" });
    try {
      const r = await fetch(`/api/tools/ai-readiness?url=${encodeURIComponent(url.trim())}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not check that site");
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
              className={styles.input}
              type="text"
              inputMode="url"
              placeholder="yourwebsite.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-label="Website URL"
              autoComplete="off"
            />
            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? "Checking…" : "Check my site"}
            </button>
          </form>
          {err && <p className={styles.err} role="alert">{err}</p>}
        </header>

        {result && (
          <section className={styles.results} aria-live="polite">
            <div className={styles.scoreCard} data-grade={result.grade}>
              <div className={styles.scoreNum}>
                <span className="mono">{result.score}</span>
                <span className={styles.scoreOf}>/100</span>
              </div>
              <div className={styles.scoreMeta}>
                <span className={styles.grade}>Grade {result.grade}</span>
                <span className={styles.scoreUrl}>{result.url}</span>
              </div>
            </div>

            <ul className={styles.checks}>
              {result.checks.map((c) => (
                <li key={c.id} className={styles.check} data-status={c.status}>
                  <span className={styles.icon} aria-hidden="true">{STATUS_ICON[c.status]}</span>
                  <div className={styles.checkBody}>
                    <p className={styles.checkLabel}>{c.label}</p>
                    <p className={styles.checkDetail}>{c.detail}</p>
                    {c.fix && <p className={styles.checkFix}><span className={styles.fixTag}>Fix</span> {c.fix}</p>}
                  </div>
                </li>
              ))}
            </ul>

            <div className={styles.cta}>
              <div>
                <h2 className={styles.ctaTitle}>This is the surface. Want the full picture?</h2>
                <p className={styles.ctaText}>
                  The <strong>AI-Search Visibility Audit</strong> goes further: we test whether ChatGPT,
                  Perplexity and Google actually <em>cite you</em> for your real buyer queries, benchmark you
                  against named competitors, and hand you a prioritized fix list as a PDF and web report.
                  Same day.
                </p>
              </div>
              <Link
                to="/signup?offer=ai_audit"
                className={styles.ctaBtn}
                onClick={() => track("tool_cta_clicked", { tool: "ai_readiness", offer: "ai_audit" })}
              >
                Get the full audit · $249 →
              </Link>
            </div>
          </section>
        )}

        <section className={styles.faq}>
          <h2 className={styles.faqHead}>How this works</h2>
          <div className={styles.faqItem}>
            <h3>What does the checker actually test?</h3>
            <p>
              It fetches your homepage and robots.txt and checks the things AI search engines rely on:
              whether their crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) are allowed,
              whether you have JSON-LD structured data, a clear title and meta description, Open Graph
              tags, an XML sitemap, and an llms.txt file.
            </p>
          </div>
          <div className={styles.faqItem}>
            <h3>Why does AI-search visibility matter?</h3>
            <p>
              AI search referrals are growing fast and answers increasingly come from a small set of
              well-structured, crawlable pages. If AI crawlers are blocked or your pages have no
              structure, you are invisible in those answers no matter how good your site looks to people.
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
