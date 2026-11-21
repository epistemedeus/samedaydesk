import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { track } from "../lib/posthog";
import { journey } from "../lib/journey";
import styles from "./AgentMark.module.css";

// "For AI agents": a dropdown drawn as a callout on the drafting sheet. Opening it copies
// nothing; each row shows its full text and has its own Copy. The rows are in the HTML at rest
// (a closed popover), so agents and readers without script see them. In the phone menu the same
// rows sit inline under a heading.
const ROWS = [
  {
    key: "tell",
    label: "Tell your assistant",
    prompt: "›",
    value: "Read https://samedaydesk.com/start.md, then run the free route check on my service and tell me which build fits.",
  },
  { key: "command", label: "Command line", prompt: "$", value: "npx -y github:epistemedeus/ai-readiness yoursite.com" },
  { key: "tool", label: "Connect as a tool", prompt: "mcp://", value: "https://samedaydesk.com/mcp" },
];
const PERSON = "Using ChatGPT, Claude or another assistant? Give it one of these.";

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function Rows({ placement }: { placement: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef(0);
  return (
    <>
      <ol className={styles.rows}>
        {ROWS.map((row) => (
          <li key={row.key} className={styles.row} data-copied={copied === row.key || undefined}>
            <span className={styles.rowLabel}>{row.label}</span>
            <span className={styles.prompt} aria-hidden="true">{row.prompt}</span>
            <code className={styles.value}>{row.value}</code>
            <button
              type="button"
              className={styles.chip}
              onClick={async () => {
                if (!(await copy(row.value))) return;
                track("quickstart_copy", { site: "samedaydesk", variant: row.key, placement });
                setCopied(row.key);
                clearTimeout(timer.current);
                timer.current = window.setTimeout(() => setCopied(null), 2000);
              }}
            >
              {copied === row.key ? "Copied" : "Copy"}
            </button>
          </li>
        ))}
      </ol>
      <span className={styles.status} role="status" aria-live="polite">
        {copied ? `Copied: ${ROWS.find((r) => r.key === copied)?.label}` : ""}
      </span>
      <Link to="/for-agents" className={styles.more}>Everything for AI agents <span aria-hidden="true">→</span></Link>
    </>
  );
}

export default function AgentMark({ placement }: { placement: "nav" | "footer" | "menu" }) {
  const id = `agent-${useId().replace(/:/g, "")}`;
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pop = panel.current;
    const btn = trigger.current;
    if (!pop || !btn) return;
    const onToggle = (event: Event) => {
      const open = (event as ToggleEvent).newState === "open";
      if (open) {
        journey("agent_dropdown_opened");
        track("quickstart_tab", { site: "samedaydesk", placement });
        // Without anchor positioning, place the callout under its trigger by hand.
        if (!CSS.supports("position-anchor: --a")) {
          const r = btn.getBoundingClientRect();
          const below = r.bottom + 40 + pop.offsetHeight < innerHeight;
          pop.style.margin = "0";
          pop.style.top = `${below ? r.bottom + 34 : Math.max(8, r.top - 34 - pop.offsetHeight)}px`;
          pop.style.left = `${Math.min(Math.max(8, r.right - pop.offsetWidth), innerWidth - pop.offsetWidth - 8)}px`;
        }
        // Snap the callout to the drafting grid, and let the hero's reticle sight it.
        const p = pop.getBoundingClientRect();
        const grid = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--grid")) || 8;
        pop.style.translate = `${Math.round(p.left / grid) * grid - p.left}px ${Math.round(p.top / grid) * grid - p.top}px`;
        window.dispatchEvent(new CustomEvent("sdd:sight", { detail: { x: p.left + p.width / 2, y: p.top + p.height / 2 } }));
      } else {
        pop.style.translate = "";
        window.dispatchEvent(new CustomEvent("sdd:sight", { detail: null }));
      }
    };
    pop.addEventListener("toggle", onToggle);
    return () => pop.removeEventListener("toggle", onToggle);
  }, [placement]);

  if (placement === "menu") {
    return (
      <section className={styles.inline} aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} className={styles.inlineTitle}>For AI agents</h2>
        <p className={styles.person}>{PERSON}</p>
        <Rows placement={placement} />
      </section>
    );
  }

  return (
    <div className={`${styles.desk} ${placement === "nav" ? styles.inNav : styles.inFooter}`}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        popoverTarget={id}
        data-agent-trigger
        style={{ anchorName: `--${id}` } as React.CSSProperties}
      >
        For AI agents
        <svg className={styles.chevron} width="9" height="6" viewBox="0 0 9 6" aria-hidden="true">
          <path d="M.75.75 4.5 4.5 8.25.75" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        className={`${styles.callout} ${placement === "footer" ? styles.up : ""}`}
        style={{ positionAnchor: `--${id}` } as React.CSSProperties}
        aria-labelledby={`${id}-fig`}
      >
        <span className={styles.leader} aria-hidden="true" />
        <p id={`${id}-fig`} className={styles.fig}>Fig. A / Agent access</p>
        <p className={styles.person}>{PERSON}</p>
        <Rows placement={placement} />
      </div>
    </div>
  );
}
