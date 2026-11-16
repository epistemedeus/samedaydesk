import { useRef, useState } from "react";
import { track } from "../lib/posthog";
import styles from "./DomainCheck.module.css";

// It runs on you: the free check, on the visitor's own address, printed as a
// till receipt line by line. The result is the server's answer, nothing added.
type Check = { id: string; label: string; status: "pass" | "warn" | "fail"; detail: string; fix: string | null };
type Result = { url: string; score: number; grade: string; checks: Check[] };
const MARK = { pass: "OK  ", warn: "WARN", fail: "FAIL" } as const;

function receiptText(r: Result) {
  const lines = [
    "SAMEDAYDESK  FREE ROUTE CHECK",
    `SITE   ${r.url}`,
    `TIME   ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "-".repeat(36),
    ...r.checks.map((c) => `${MARK[c.status]}  ${c.label}`),
    "-".repeat(36),
    `SCORE  ${r.score}/100   GRADE ${r.grade}`,
  ];
  const fixes = r.checks.filter((c) => c.fix).map((c) => `- ${c.label}: ${c.fix}`);
  if (fixes.length) lines.push("", "FIXES", ...fixes);
  lines.push("", "Next: https://samedaydesk.com/start.md");
  return lines.join("\n");
}

export default function DomainCheck() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const out = useRef<HTMLDivElement>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = url.trim();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(value.replace(/^https?:\/\//, ""))) {
      setError("Enter a domain, like example.com.");
      setState("error");
      return;
    }
    setError("");
    setState("pending");
    try {
      const target = /^https?:\/\//.test(value) ? value : `https://${value}`;
      const r = await fetch(`/api/tools/ai-readiness?url=${encodeURIComponent(target)}`);
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as Result;
      setResult(d);
      setState("done");
      track("tool_check_done", { tool: "ai_readiness", where: "home_receipt", score: d.score });
      requestAnimationFrame(() => out.current?.focus());
    } catch {
      setError("The check did not answer. Try again, or open the full checker.");
      setState("error");
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(receiptText(result));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* the receipt stays selectable */ }
  };

  return (
    <section id="check" className={styles.section} aria-labelledby="check-h">
      <div className={`container ${styles.grid}`}>
        <div>
          <p className="eyebrow">Free · no signup</p>
          <h2 id="check-h" className={styles.title}>Run the check on your own site.</h2>
          <p className={styles.lead}>Type your domain. The free route check reads what agents and AI crawlers see, and prints the result as a receipt you can hand to your agent.</p>
          <form className={styles.form} onSubmit={run} noValidate>
            <label htmlFor="check-url" className={styles.label}>Your domain</label>
            <div className={styles.row}>
              <input id="check-url" name="url" inputMode="url" autoComplete="url" spellCheck={false}
                value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={state === "error" || undefined}
                aria-describedby={error ? "check-err" : undefined} className={styles.input} />
              <button type="submit" className={styles.go} disabled={state === "pending"}>{state === "pending" ? "Checking" : "Run the check"}</button>
            </div>
            <p id="check-err" className={styles.err} role="alert">{error}</p>
          </form>
        </div>
        <div className={styles.till} aria-live="polite">
          {state === "done" && result ? (
            <div ref={out} tabIndex={-1} className={styles.receipt} aria-label="Check result">
              <pre className={styles.paper}>{receiptText(result).split("\n").map((l, i) => <span key={i} style={{ "--i": i } as React.CSSProperties}>{l + "\n"}</span>)}</pre>
              <button type="button" className={styles.copy} onClick={copy}>{copied ? "Copied" : "Copy for your agent"}</button>
            </div>
          ) : (
            <pre className={`${styles.paper} ${styles.blank}`} aria-hidden={state !== "pending" || undefined}>
              {state === "pending" ? "PRINTING…\n" : "SAMEDAYDESK  FREE ROUTE CHECK\nSITE   your domain\n------------------------------------\n\n   the receipt prints here\n\n------------------------------------"}
            </pre>
          )}
        </div>
      </div>
    </section>
  );
}
