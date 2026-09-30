import { useEffect, useState, type FormEvent } from "react";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { track } from "../lib/posthog";
import styles from "./AiReadiness.module.css";

type Check = { id: string; status: string; code: string | null; detail: string };
type Report = {
  origin?: string;
  url?: string;
  score: number;
  grade: string;
  verdict: string;
  failClosed: string[];
  checks: Check[];
};
type HostPin = {
  hostId: string;
  label: string;
  origin: string;
  score: number;
  grade: string;
  verdict: string;
  heldOut: boolean;
  failClosed: string[];
};
type Baseline = { auditDate: string; known: HostPin[]; seeded: HostPin[]; coverageRows: number; note: string };

const STATUS_ICON: Record<string, string> = { pass: "✓", fail: "✕", missing: "!", gap: "!", reject: "✕" };

export default function AgentReadiness() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<Report | null>(null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Free agent-readiness check | SameDayDesk";
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute("content") ?? null;
    meta?.setAttribute(
      "content",
      "Free agent-readiness check for discovery files, MCP handshake and tools/list, cross-surface identity, CORS, x402, and the agent card.",
    );
    fetch("/api/tools/agent-readiness/baseline")
      .then((response) => response.json())
      .then((body) => setBaseline(body as Baseline))
      .catch(() => setBaseline(null));
    return () => {
      document.title = prevTitle;
      if (prevDesc !== null) meta?.setAttribute("content", prevDesc);
    };
  }, []);

  async function run(event: FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    track("tool_check_run", { tool: "agent_readiness" });
    try {
      const response = await fetch(`/api/tools/agent-readiness?url=${encodeURIComponent(url.trim())}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not check that site");
      setResult(body as Report);
      track("tool_check_done", { tool: "agent_readiness", score: body.score, verdict: body.verdict });
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const held = baseline?.seeded.find((host) => host.hostId === "held-out-seed");

  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <header className={styles.head}>
          <p className="eyebrow">Free tool · no signup · no payment</p>
          <h1 className={styles.h1}>
            Can an agent <span className="lime">actually connect</span>?
          </h1>
          <p className={styles.lead}>
            This check reads public discovery files, the MCP handshake and tools/list, CORS, the x402
            manifest, and the agent card. A document that comes back in the wrong shape fails closed
            with a stable code. It does not pay and it does not call a paid route.
          </p>
          <form className={styles.form} onSubmit={run}>
            <input
              className={styles.input}
              type="text"
              inputMode="url"
              placeholder="https://example.com"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              aria-label="Website URL"
              autoComplete="off"
            />
            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? "Checking…" : "Check this host"}
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
                <span className={styles.grade}>{result.verdict} · grade {result.grade}</span>
                <span className={styles.scoreUrl}>{result.origin || result.url}</span>
              </div>
            </div>
            {result.failClosed.length > 0 && (
              <p className={styles.checkDetail}>Fail closed: {result.failClosed.join(", ")}</p>
            )}
            <ul className={styles.checks}>
              {result.checks.map((check) => (
                <li key={check.id} className={styles.check} data-status={check.status === "fail" ? "fail" : check.status === "pass" ? "pass" : "warn"}>
                  <span className={styles.icon} aria-hidden="true">{STATUS_ICON[check.status] || "·"}</span>
                  <div className={styles.checkBody}>
                    <p className={styles.checkLabel}>{check.id}</p>
                    <p className={styles.checkDetail}>{check.detail}{check.code ? ` (${check.code})` : ""}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {baseline && (
          <section className={styles.results}>
            <h2 className={styles.ctaTitle}>Known hosts, {baseline.auditDate} baseline</h2>
            <p className={styles.lead}>
              {baseline.coverageRows} coverage rows. The held-out fixture is not one of the live hosts
              {held ? ` and scores ${held.score}, verdict ${held.verdict}` : ""}.
            </p>
            <ul className={styles.checks}>
              {baseline.known.map((host) => (
                <li key={host.hostId} className={styles.check} data-status={host.verdict === "reject" ? "fail" : host.verdict === "pass" ? "pass" : "warn"}>
                  <span className={styles.icon} aria-hidden="true">{host.score}</span>
                  <div className={styles.checkBody}>
                    <p className={styles.checkLabel}>{host.label}</p>
                    <p className={styles.checkDetail}>{host.verdict} · grade {host.grade}{host.failClosed.length ? ` · ${host.failClosed.join(", ")}` : ""}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
