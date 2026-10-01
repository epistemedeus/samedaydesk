import { Router } from "express";
import { clientKey } from "../lib/agent-readiness/rate-limit.js";
import { runAgentReadinessCheck } from "../lib/agent-readiness/service.js";

export function createAgentReadinessRouter(deps = {}) {
  const run = deps.run || runAgentReadinessCheck;
  const router = Router();
  router.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Accept");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[ch]));

function shell(title, description, body, { canonical, robots, jsonHref }) {
  return `<!doctype html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="${esc(robots)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:image" content="https://samedaydesk.com/og.png">
${jsonHref ? `<link rel="alternate" type="application/json" href="${esc(jsonHref)}">` : ""}
<style>
  :root{--bg:#f4f1ea;--card:#f8f5ee;--ink:#1a1a1a;--dim:#55524c;--line:#c9c4b8;--oxide:#9e3b2e;--good:#3a7d44;--warn:#b58100}
  *{box-sizing:border-box}html{background:var(--bg)}
  body{margin:0;color:var(--ink);background:var(--bg);font:17px/1.55 Inter,system-ui,-apple-system,sans-serif}
  .wrap{max-width:58rem;margin:0 auto;padding:2.2rem 1.2rem 4.5rem}
  a{color:var(--oxide)}
  .eyebrow{font:600 12px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--oxide);margin:0 0 .8rem}
  h1{font-size:clamp(1.7rem,1.2rem+1.5vw,2.4rem);line-height:1.12;letter-spacing:-.02em;margin:.15em 0 .4em}
  form{display:flex;gap:.5rem;margin:1rem 0 1.2rem;flex-wrap:wrap}
  input{flex:1;min-width:14rem;padding:.75rem .9rem;font:inherit;border:1px solid var(--line);border-radius:9px;background:#fff}
  button,.btn{padding:.75rem 1.1rem;font:inherit;font-weight:650;background:var(--oxide);color:#fff;border:none;border-radius:9px;text-decoration:none;display:inline-block}
  .score{display:flex;align-items:center;gap:1.2rem;padding:1.1rem 1.3rem;background:var(--card);border:1px solid var(--line);border-left:5px solid var(--ink);border-radius:12px;margin:1rem 0}
  .big{font:700 3rem/1 ui-monospace,monospace}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
  th,td{text-align:left;padding:.65rem .75rem;border-bottom:1px solid var(--line);vertical-align:top}
  th{font-size:.85rem;letter-spacing:.04em;text-transform:uppercase}
  .pass{color:var(--good);font-weight:700}.warn{color:var(--warn);font-weight:700}.fail{color:var(--oxide);font-weight:700}.na{color:var(--dim);font-weight:700}
  .fixes{padding-left:1.2rem}
  .muted{color:var(--dim)}
  .err{color:var(--oxide)}
  footer{margin-top:2rem;padding-top:1rem;border-top:1px solid var(--line);color:var(--dim);font-size:.9rem}
  @media(max-width:640px){.wrap{padding:1.4rem .9rem 3rem}table{display:block;overflow-x:auto}}
</style></head><body><div class="wrap">${body}
<footer>Free, no signup. Agents: same URL with <code>?format=json&amp;host=example.com</code>, or the MCP tool <code>check_agent_readiness</code> at <a href="https://samedaydesk.com/mcp">samedaydesk.com/mcp</a>. <a href="https://samedaydesk.com/">SameDayDesk</a></footer>
</div></body></html>`;
}

function form(prefill = "") {
  return `<form action="/agent-readiness" method="get">
    <input type="text" name="host" placeholder="example.com" value="${esc(prefill)}" aria-label="Host" autocomplete="off">
    <button type="submit">Score this host</button>
  </form>`;
}

function hostParam(req) {
  return String(req.query.host || req.query.url || "").trim();
}

function statusClass(status) {
  return status === "pass" || status === "warn" || status === "fail" || status === "na" ? status : "na";
}

router.get("/", async (req, res) => {
  const format = String(req.query.format || "").trim();
  const host = hostParam(req);
  const description = "Free agent readiness check: discovery files, MCP handshake, tools list, agent card, cross-surface identity, CORS, x402, and a fix pack. No signup.";
  if (!host) {
    if (format === "json" || format === "fix-pack") {
      return res.status(400).json({ error: "Provide a host, for example example.com" });
    }
    return res.type("html").send(shell(
      "Agent readiness checker | SameDayDesk",
      description,
      `<p class="eyebrow">SameDayDesk · Free tool</p>
       <h1>Can an agent discover and call this site?</h1>
       <p class="muted">Enter a public host. The check fetches discovery files, follows MCP links named in those files, and runs only an MCP initialize, a tools list, and one unknown-tool call. It never runs a real tool.</p>
       ${form()}`,
      { canonical: "https://samedaydesk.com/agent-readiness", robots: "index,follow" },
    ));
  }

  try {
    const result = await run(host, { clientKey: clientKey(req) });
    if (format === "json") {
      res.set("Cache-Control", "no-store");
      return res.json(result.payload);
    }
    if (format === "fix-pack") {
      const safe = result.payload.host.replace(/[^A-Za-z0-9.-]+/g, "-");
      res.set("Cache-Control", "no-store");
      res.set("Content-Disposition", `attachment; filename="agent-readiness-${safe}-fix-pack.md"`);
      return res.type("text/markdown").send(result.fixPack);
    }
    const payload = result.payload;
    const jsonHref = `/agent-readiness?host=${encodeURIComponent(host)}&format=json`;
    const packHref = `/agent-readiness?host=${encodeURIComponent(host)}&format=fix-pack`;
    const body = `
      <p class="eyebrow">SameDayDesk · Agent readiness</p>
      <h1>${esc(payload.host)} scored ${esc(payload.score)} / 100</h1>
      <div class="score"><span class="big">${esc(payload.score)}</span><div><b>Free check</b><div class="muted">${esc(payload.probedAt)}</div></div></div>
      ${payload.wwwFallback ? `<p class="muted">Apex ${esc(payload.wwwFallback.from)} had no page, so this score is for ${esc(payload.wwwFallback.to)}.</p>` : ""}
      <p><a class="btn" href="${esc(packHref)}">Download Fix Pack</a> <a href="${esc(jsonHref)}">JSON for agents</a></p>
      <h2>Top 3 fixes</h2>
      <ol class="fixes">${payload.topFixes.map((fix) => `<li><b>${esc(fix.title)}</b> ${esc(fix.fix)}</li>`).join("") || "<li>No gaps in the checked surfaces.</li>"}</ol>
      <h2>Categories</h2>
      <table>
        <thead><tr><th>Category</th><th>Weight</th><th>Points</th></tr></thead>
        <tbody>${payload.categories.map((category) => `<tr><td>${esc(category.label)}</td><td>${esc(category.weight)}</td><td>${esc(Number(category.points).toFixed(1))}</td></tr>`).join("")}</tbody>
      </table>
      <h2>Checks</h2>
      <table>
        <thead><tr><th>Status</th><th>Check</th><th>Why</th><th>Evidence</th></tr></thead>
        <tbody>${payload.checks.map((check) => `<tr><td class="${statusClass(check.status)}">${esc(check.status)}</td><td>${esc(check.title)}<div class="muted">${esc(check.fix)}</div></td><td>${esc(check.reason)}</td><td>${check.evidenceUrl ? `<a href="${esc(check.evidenceUrl)}">${esc(check.evidenceUrl)}</a>` : ""}</td></tr>`).join("")}</tbody>
      </table>
      <p class="muted">Check another host:</p>${form(host)}`;
    return res.type("html").send(shell(
      `Agent readiness ${payload.score}/100 for ${payload.host} | SameDayDesk`,
      description,
      body,
      {
        canonical: "https://samedaydesk.com/agent-readiness",
        robots: "noindex,follow",
        jsonHref,
      },
    ));
  } catch (err) {
    const status = err.status || 502;
    const message = status === 400 || status === 429 ? err.message : "Could not probe that host";
    if (format === "json" || format === "fix-pack") {
      if (status === 429 && err.retryAfterSec) res.set("Retry-After", String(err.retryAfterSec));
      return res.status(status).json({ error: message });
    }
    if (status === 429 && err.retryAfterSec) res.set("Retry-After", String(err.retryAfterSec));
    return res.status(status).type("html").send(shell(
      "Agent readiness checker | SameDayDesk",
      description,
      `<p class="eyebrow">SameDayDesk · Agent readiness</p><h1>Could not score that host</h1><p class="err">${esc(message)}</p>${form(host)}`,
      { canonical: "https://samedaydesk.com/agent-readiness", robots: "noindex,follow" },
    ));
  }
});

  return router;
}

export default createAgentReadinessRouter();
