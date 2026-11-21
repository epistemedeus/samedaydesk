import { useEffect, useState } from "react";
import styles from "./AiView.module.css";

// "What an AI sees": the homepage as an assistant reads it, from what this server actually
// sends (the HTML before any script runs, and the start file it points to), beside an ordinary
// page drawn only by script, which reads as almost nothing.
type Read = { title: string; lines: string[]; offers: string[]; start: string[]; startHref: string | null };

function readPage(html: string): Omit<Read, "start"> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const noscript = doc.querySelector("noscript");
  const body = new DOMParser().parseFromString(noscript?.innerHTML || "", "text/html");
  const text = (sel: string) => Array.from(body.querySelectorAll(sel)).map((el) => (el.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  return {
    title: doc.title,
    lines: [...text("h1").slice(0, 1), ...text("p").slice(0, 1)].filter((line) => line !== doc.title),
    offers: text("h2 + ul li").slice(0, 6),
    startHref: doc.querySelector('link[rel="alternate"][type="text/markdown"]')?.getAttribute("href") ?? null,
  };
}

export default function AiView() {
  const [read, setRead] = useState<Read | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const page = readPage(await (await fetch("/", { headers: { accept: "text/html" } })).text());
        const start = page.startHref ? (await (await fetch(page.startHref)).text()).split("\n").filter((l) => l.trim()).slice(0, 4) : [];
        if (live) setRead({ ...page, start });
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => { live = false; };
  }, []);

  return (
    <div className={styles.view} aria-live="polite">
      <div className={styles.pane}>
        <p className={styles.tag}>Before · an ordinary page</p>
        <pre className={styles.read}>
{`title: Book a table
body:  (empty: the page is drawn by script)

An assistant reading this learns the name and nothing it can act on.`}
        </pre>
      </div>
      <div className={styles.pane}>
        <p className={styles.tag}>After · this page, as an assistant reads it</p>
        {failed && <pre className={styles.read}>This page could not be read just now. Try again.</pre>}
        {!failed && !read && <pre className={styles.read}>Reading what the server sends…</pre>}
        {read && (
          <pre className={styles.read}>
{`title: ${read.title}
${read.lines.join("\n")}

offers:
${read.offers.map((o) => `  ${o}`).join("\n")}

start file: ${read.startHref ?? "none"}
${read.start.map((l) => `  ${l}`).join("\n")}`}
          </pre>
        )}
      </div>
    </div>
  );
}
