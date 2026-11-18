import { useId, useState } from "react";
import { track } from "../lib/posthog";
import styles from "./AgentMark.module.css";

// The agent mark: one quiet label. A press copies the sentence a person sends to their agent;
// the chevron opens the other ways. Without script it is a link to start.md.
const SENTENCE =
  "Read https://samedaydesk.com/start.md, then run the free route check on my service and tell me which build fits.";
const LINES = [
  { label: "The sentence", value: SENTENCE },
  { label: "Command line", value: 'curl -s "https://samedaydesk.com/api/tools/ai-readiness?url=https://example.com"' },
  { label: "MCP", value: "https://samedaydesk.com/mcp" },
];
const DONE = "Copied. Paste it into your assistant.";

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); } catch { /* the label still links to start.md */ }
}

export default function AgentMark({ placement }: { placement: "nav" | "footer" }) {
  const [copied, setCopied] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const pop = useId().replace(/:/g, "");

  return (
    <span className={`${styles.mark} ${placement === "nav" ? styles.inNav : ""}`}>
      <a
        href="/start.md"
        className={styles.label}
        onClick={async (e) => {
          e.preventDefault();
          await copy(SENTENCE);
          track("quickstart_copy", { site: "samedaydesk", variant: "sentence", placement });
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? DONE : <>For your agent <span className={styles.glyph} aria-hidden="true">⧉</span></>}
      </a>
      <button type="button" className={styles.more} popoverTarget={`agent-${pop}`} aria-label="Other ways to reach your agent"
        onClick={() => track("quickstart_tab", { site: "samedaydesk", placement })}>
        <span aria-hidden="true">⌄</span>
      </button>
      <span className={styles.status} role="status" aria-live="polite">{copied ? DONE : ""}</span>
      <div id={`agent-${pop}`} popover="auto" className={styles.pop}>
        <p className={styles.head}>Send one line to your agent</p>
        {LINES.map((l) => (
          <div key={l.label} className={styles.line}>
            <span className="mono">{l.label}</span>
            <code>{l.value}</code>
            <button type="button" onClick={async () => { await copy(l.value); setLine(l.label); setTimeout(() => setLine(null), 2000); }}>
              {line === l.label ? "Copied" : "Copy"}
            </button>
          </div>
        ))}
        <p className={styles.foot}>Your agent checks your service free and brings back the build that fits, with its price.</p>
      </div>
    </span>
  );
}
