import { useEffect, useRef, useState } from "react";
import { track } from "../lib/posthog";
import styles from "./QuickStart.module.css";
import { QUICKSTART } from "../data/quickstart";



type Tab = "prompt" | "cli" | "mcp";
const ICONS: Record<Tab | "copy", React.ReactNode> = {
  prompt: <><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" /><path d="M5 6.2h6M5 8.2h4" /></>,
  cli: <><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><path d="M4 6l2.2 2L4 10M8 10.5h4" /></>,
  mcp: <path d="M5.5 1.5v3M10.5 1.5v3M3.5 4.5h9v2.5a4.5 4.5 0 0 1-9 0zM8 11.5v3" />,
  copy: <><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5v-3h-8v8h3" /></>,
};
const Icon = ({ name }: { name: Tab | "copy" }) => (
  <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true">{ICONS[name]}</svg>
);
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
      <div className={styles.head}>
        <span className={styles.dot} aria-hidden="true" />
        <p className={styles.label} id="qs-label">{QUICKSTART.label}</p>
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
              <Icon name={t.id} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={styles.slip} id={`qs-panel-${tab}`} role="tabpanel" aria-labelledby={`qs-tab-${tab}`}>
        {tab === "prompt" ? (
          <p className={styles.line}>{TEXT[tab]}</p>
        ) : (
          <code className={styles.code}><span className={styles.prompt} aria-hidden="true">{tab === "cli" ? "$ " : ""}</span>{TEXT[tab]}</code>
        )}
        <button type="button" className={styles.copy} data-copied={copied || undefined} onClick={onCopy}>
          <Icon name="copy" />
          {copied ? "Copied" : tab === "prompt" ? "Copy for your agent" : "Copy"}
        </button>
      </div>
      <p className={styles.help}>{HELP[tab]}</p>
      <p className="visually-hidden" aria-live="polite">{status}</p>
    </section>
  );
}
