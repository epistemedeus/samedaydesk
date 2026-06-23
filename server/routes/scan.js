import { Router } from "express";
import { runCheck } from "./tools.js";

// Server-rendered, shareable proof page: /scan?url=<site> renders THAT site's AI-readiness
// score + specific gaps + the $39 Fix Pack CTA as clean HTML (no JS, crawlable). This is the
// one-link "proof" used in outreach: a prospect clicks it and sees their own failing result.
const router = Router();

const FIX_PACK = "https://buy.stripe.com/28E5kE9465np2OPh2WeZ20e"; // $39
const AUDIT = "https://buy.stripe.com/fZuaEY2FI4jl2OPbICeZ206";   // $249

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function shell(title, desc, body) {
  return `<!doctype html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="noindex">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:image" content="https://samedaydesk.com/og.png">
<style>
  :root{--bg:#f4f1ea;--card:#f8f5ee;--ink:#1a1a1a;--dim:#55524c;--line:#c9c4b8;--oxide:#9e3b2e;--good:#3a7d44;--warn:#b58100}
  *{box-sizing:border-box}html{background:var(--bg)}
  body{margin:0;color:var(--ink);background:var(--bg);font:17px/1.6 Inter,system-ui,-apple-system,sans-serif}
  .wrap{max-width:46rem;margin:0 auto;padding:2.5rem 1.25rem 5rem}
  a{color:var(--oxide)}
  .eyebrow{font:600 12px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--oxide);margin:0 0 1rem}
  h1{font-size:clamp(1.5rem,1.2rem+1.6vw,2.2rem);line-height:1.12;letter-spacing:-0.02em;margin:.2em 0}
  .score{display:flex;align-items:center;gap:1.2rem;padding:1.2rem 1.4rem;background:var(--card);border:1px solid var(--line);border-left:5px solid var(--ink);border-radius:12px;margin:1.2rem 0}
  .score.A,.score.B{border-left-color:var(--good)} .score.C{border-left-color:var(--warn)} .score.D,.score.F{border-left-color:var(--oxide)}
  .big{font:700 3rem/1 ui-monospace,monospace}
  .checks{list-style:none;padding:0;margin:1.2rem 0;display:grid;gap:.5rem}
  .c{display:flex;gap:.7rem;padding:.8rem 1rem;background:var(--card);border:1px solid var(--line);border-radius:9px}
  .ic{flex:none;width:1.5rem;height:1.5rem;display:grid;place-items:center;border-radius:50%;font-weight:700;font-size:.8rem;color:#fff}
  .pass .ic{background:var(--good)} .warn .ic{background:var(--warn)} .fail .ic{background:var(--oxide)}
  .c b{display:block}
  .c .fix{color:var(--dim);font-size:.92rem;margin-top:.2rem}
  .cta{background:#15181d;color:#f4f4f0;border-radius:14px;padding:1.5rem;margin:1.6rem 0}
  .cta h2{margin:0 0 .4rem;color:#fff}
  .cta a.btn{display:inline-block;margin:.5rem .5rem 0 0;background:#ccff00;color:#0a0b0d;font-weight:700;text-decoration:none;padding:.7rem 1.2rem;border-radius:9px}
  .cta a.btn2{display:inline-block;margin:.5rem 0 0;color:#ccff00;border:1px solid #444;text-decoration:none;padding:.7rem 1.2rem;border-radius:9px}
  form{display:flex;gap:.5rem;margin:1rem 0}
  input{flex:1;padding:.7rem .9rem;font:inherit;border:1px solid var(--line);border-radius:9px;background:#fff}
  button{padding:.7rem 1.2rem;font:inherit;font-weight:600;background:var(--oxide);color:#fff;border:none;border-radius:9px;cursor:pointer}
  .muted{color:var(--dim);font-size:.9rem}
  footer{margin-top:2.5rem;padding-top:1.2rem;border-top:1px solid var(--line);color:var(--dim);font-size:.9rem}
</style></head><body><div class="wrap">${body}
<footer>By <a href="https://samedaydesk.com/">SameDayDesk</a>. Run the full free tool: <a href="https://samedaydesk.com/tools/ai-readiness">samedaydesk.com/tools/ai-readiness</a>. Reproduce: <code>npx github:epistemedeus/ai-readiness</code></footer>
</div></body></html>`;
}

const ICON = { pass: "✓", warn: "!", fail: "✕" };

function form(prefill = "") {
  return `<form action="/scan" method="get"><input type="text" name="url" placeholder="yourwebsite.com" value="${esc(prefill)}" aria-label="Website URL"><button type="submit">Scan</button></form>`;
}

router.get("/", async (req, res) => {
  const urlParam = req.query.url;
  if (!urlParam) {
    return res.send(shell(
      "Free AI-search readiness scan",
      "Paste a URL and see whether ChatGPT, Perplexity, Claude and Google AI can crawl and understand the site.",
      `<p class="eyebrow">SameDayDesk · Free scan</p><h1>Is a site visible to AI search?</h1>
       <p class="muted">See whether ChatGPT, Perplexity, Claude and Google AI can crawl and understand any site, with the exact fixes.</p>${form()}`
    ));
  }
  try {
    const r = await runCheck(urlParam);
    const fails = r.checks.filter((c) => c.status !== "pass");
    const host = (() => { try { return new URL(r.url).hostname.replace(/^www\./, ""); } catch { return r.url; } })();
    const headline = r.grade === "A"
      ? `${host} is in good shape for AI search (${r.score}/100)`
      : `${host} scored ${r.score}/100 for AI search`;
    const ctaTitle = r.grade === "A"
      ? "Solid. Want the deep audit?"
      : `${fails.length} thing${fails.length === 1 ? "" : "s"} ${fails.length === 1 ? "is" : "are"} holding ${host} back`;
    const ctaText = r.grade === "A"
      ? "The technical basics look good. The AI-Search Visibility Audit goes further: it tests whether ChatGPT, Perplexity and Google AI actually cite you for your buyer queries and benchmarks you vs competitors."
      : "We can fix all of it today. The $39 Fix Pack gives you copy-paste JSON-LD, a corrected robots.txt, a sitemap, and clean title/meta/Open Graph tags built for this exact site, delivered same day.";

    const body = `
      <p class="eyebrow">SameDayDesk · AI-search readiness</p>
      <h1>${esc(headline)}</h1>
      <div class="score ${esc(r.grade)}"><span class="big">${esc(String(r.score))}</span><div><b>Grade ${esc(r.grade)}</b><div class="muted">${esc(r.url)}</div></div></div>
      <ul class="checks">
        ${r.checks.map((c) => `<li class="c ${esc(c.status)}"><span class="ic">${ICON[c.status]}</span><div><b>${esc(c.label)}</b><span class="muted">${esc(c.detail)}</span>${c.fix ? `<div class="fix"><b>Fix:</b> ${esc(c.fix)}</div>` : ""}</div></li>`).join("")}
      </ul>
      <div class="cta">
        <h2>${esc(ctaTitle)}</h2>
        <p>${esc(ctaText)}</p>
        ${r.grade === "A"
          ? `<a class="btn" href="${AUDIT}">Get the full audit · $249</a>`
          : `<a class="btn" href="${FIX_PACK}">Fix it today · $39</a><a class="btn2" href="${AUDIT}">Full audit · $249</a>`}
      </div>
      <p class="muted">Check another site:</p>${form()}
      <p class="muted">Snapshot of the homepage + robots.txt, ${esc(new Date(r.checkedAt).toISOString().slice(0, 10))}.</p>`;
    res.send(shell(headline, `${host} scored ${r.score}/100 for AI search. See the gaps and fixes.`, body));
  } catch (e) {
    res.status(e.status || 502).send(shell(
      "Couldn't scan that site",
      "We couldn't reach that site for an AI-readiness scan.",
      `<p class="eyebrow">SameDayDesk · AI-search readiness</p><h1>Couldn't scan that site</h1>
       <p class="muted">${esc(e.message || "Could not reach that site")}. Try another URL:</p>${form(typeof urlParam === "string" ? urlParam : "")}`
    ));
  }
});

export default router;
