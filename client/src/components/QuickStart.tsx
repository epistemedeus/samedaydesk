import { useEffect, useRef, useState } from "react";
import { track } from "../lib/posthog";
import styles from "./QuickStart.module.css";
import { QUICKSTART } from "../data/quickstart";



type Tab = "prompt" | "cli" | "mcp";
const TABS: { id: Tab; label: string }[] = [
  { id: "prompt", label: "Prompt" },
  { id: "cli", label: "Command line" },
  { id: "mcp", label: "MCP" },
];
const TEXT: Record<Tab, string> = { prompt: QUICKSTART.prompt, cli: QUICKSTART.cli, mcp: QUICKSTART.mcp };
const HELP: Record<Tab, string> = { prompt: QUICKSTART.helper, cli: QUICKSTART.cliHelper, mcp: QUICKSTART.mcpHelper };

const meta = { site: "samedaydesk", variant: "present", placement: "hero" };

async function copy(text: string) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("copy refused");
}

export default function QuickStart({ className }: { className?: string }) {
  const [tab, setTab] = useState<Tab>("prompt");
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("");
  const root = useRef<HTMLElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const timer = useRef<number>(0);

  useEffect(() => {
    const el = root.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        track("quickstart_view", meta);
        io.disconnect();
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const choose = (next: Tab, focus = false) => {
    setTab(next);
    setCopied(false);
    if (focus) tabRefs.current[TABS.findIndex((t) => t.id === next)]?.focus();
  };

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    choose(TABS[(i + dir + TABS.length) % TABS.length].id, true);
  };

  const onCopy = async () => {
    try {
      await copy(TEXT[tab]);
      setCopied(true);
      setStatus("Copied. Paste it to your agent.");
      track("quickstart_copy", { ...meta, tab });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { setCopied(false); setStatus(""); }, 2000);
    } catch {
      setStatus("Select the text and copy it.");
    }
  };

  return (
    <section ref={root} className={`${styles.qs} ${className ?? ""}`} aria-labelledby="qs-label">
      <p className={styles.label} id="qs-label">{QUICKSTART.label}</p>
      <div className={styles.slip} id={`qs-panel-${tab}`} role="tabpanel" aria-labelledby={`qs-tab-${tab}`}>
        {tab === "prompt" ? (
          <p className={styles.line}>{TEXT[tab]}</p>
        ) : (
          <code className={styles.code}>{TEXT[tab]}</code>
        )}
        <button type="button" className={styles.copy} data-copied={copied || undefined} onClick={onCopy}>
          {copied ? "Copied" : tab === "prompt" ? "Copy for your agent" : "Copy"}
        </button>
      </div>
      <p className={styles.help}>{HELP[tab]}</p>
      <div className={styles.tabs} role="tablist" aria-label="Route">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { tabRefs.current[i] = el; }}
            type="button"
            role="tab"
            id={`qs-tab-${t.id}`}
            aria-controls={`qs-panel-${t.id}`}
            aria-selected={tab === t.id}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => { choose(t.id); track("quickstart_tab", { ...meta, tab: t.id }); }}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="visually-hidden" aria-live="polite">{status}</p>
    </section>
  );
}
