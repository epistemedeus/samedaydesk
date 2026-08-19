import { Router } from "express";
import { runCheck } from "./tools.js";
import { shell, esc } from "../lib/layout.js";
import { isPanelOn, ctaButton, openaiModel } from "../lib/panel.js";
import { RECORD } from "../pricing.js";
import { registrableDomain, checkBounds, recordRun } from "../lib/report-bounds.js";
import { runPanel } from "../lib/answer-panel.js";
import { capture } from "../lib/events.js";
import { verifyTurnstile } from "../lib/turnstile.js";

// The free AI Answer Report. Two phases on one URL, both server rendered:
// eligibility paints immediately, then answer cards stream in as each question comes back.
// Works with JavaScript switched off, because the whole thing is chunked HTML.
const router = Router();

const METHOD_VERSION = "1.0.0";
const BUDGET_CENTS = Number(process.env.REPORT_DAILY_BUDGET_CENTS || 500);

function formHtml({ values = {} } = {}) {
  const v = (k) => esc(values[k] || "");
  const siteKey = process.env.TURNSTILE_SITE_KEY;
  return `<form method="post" action="/report">
  <div class="row">
    <label for="site_url">Website address</label>
    <input type="text" id="site_url" name="site_url" value="${v("site_url")}" placeholder="yourbusiness.com" required>
  </div>
  <div class="row">
    <label for="brand">Brand name as a customer would say it</label>
    <input type="text" id="brand" name="brand" value="${v("brand")}" placeholder="the name people search for, not the holding company" required>
  </div>
  <details>
    <summary>Optional: sharpen the questions we ask</summary>
    <div class="row"><label for="city">City or market</label><input type="text" id="city" name="city" value="${v("city")}"></div>
    <div class="row"><label for="category">The word buyers type for what you are</label><input type="text" id="category" name="category" value="${v("category")}" placeholder="plumber, property manager, plastics supplier"></div>
    <div class="row"><label for="service">One service you actually sell</label><input type="text" id="service" name="service" value="${v("service")}"></div>
    <div class="row"><label for="competitor">The name buyers compare you with</label><input type="text" id="competitor" name="competitor" value="${v("competitor")}"></div>
    <div class="row"><label for="fact">One fact that should be true</label><input type="text" id="fact" name="fact" value="${v("fact")}" placeholder="we are open Saturdays, we moved in 2024, we no longer sell X"></div>
    <div class="row"><label for="quote">Paste what an AI already said about you</label><input type="text" id="quote" name="quote" value="${v("quote")}"></div>
  </details>
  ${siteKey ? `<div class="cf-turnstile" data-sitekey="${esc(siteKey)}"></div>\n  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : ""}
  <button type="submit">${esc(ctaButton())}</button>
  <p class="hint">You do not need an email address. The report opens on the next page.</p>
</form>`;
}

router.get("/", (_req, res) => {
  res.type("html").send(
    shell({
      title: "Free AI Answer Report",
      description:
        "Check what AI answers say about a business. Eligibility checks on the next screen, then quoted answers with timestamps when the panel is running. No email address.",
      canonical: "https://samedaydesk.com/report",
      body: `<h1>Free AI Answer Report</h1>
<p class="lede">Two things happen on the next page. First the checks that decide whether an engine can read your site at all. Then, when the answer panel is running, the questions your buyers ask and what came back, quoted with a timestamp.</p>
<div class="card">${formHtml()}</div>
<h2>What this is not</h2>
<p>This is not the paid audit. The free panel asks five questions once, on one surface. The <a href="/pay/audit">audit</a> asks the full frozen panel across named engines, more than once, and a human writes the register. If nothing here fires, we say so and there is no button to press.</p>
<p>The method is published on the <a href="/methods">methods page</a>, and the same method run against our own site is the <a href="/audit/samedaydesk/2026-08-19/">self-audit</a>.</p>`,
    }),
  );
});

function head({ brand, siteUrl }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Answer Report: ${esc(brand)}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="stylesheet" href="/site.css">
</head>
<body>
<header class="site"><div class="wrap inner">
  <a class="brand" href="/">SameDayDesk</a>
  <nav aria-label="Primary"><a href="/report">New report</a><a href="/#offers">Prices</a><a href="/methods">Methods</a></nav>
</div></header>
<main id="main"><div class="wrap narrow">
<h1>AI Answer Report</h1>
<p class="muted">Cite as finding id plus status plus date. This is the free panel, not the paid audit.</p>
<div class="card">
  <table>
    <tr><th>Subject</th><td>${esc(brand)} <span class="mono">${esc(siteUrl)}</span></td></tr>
    <tr><th>As of</th><td class="mono">${new Date().toISOString()}</td></tr>
    <tr><th>Method</th><td>Free AI Answer Report, version ${METHOD_VERSION}. Not the paid audit.</td></tr>
  </table>
</div>`;
}

const tail = `</div></main>
<footer class="site"><div class="wrap">
<p>SameDayDesk is a trading name of Neomorphic LLC, Sheridan, Wyoming, United States. Operated by Lucian Constantinescu. <a href="mailto:contact@samedaydesk.com">contact@samedaydesk.com</a></p>
<p>This report is for the domain you own or work on. It is not a client engagement.</p>
</div></footer>
</body></html>`;

function eligibilityHtml(check) {
  const rows = check.checks
    .filter((c) => c.id !== "llms")
    .map(
      (c) => `<tr><td>${esc(c.label)}</td><td>${c.status === "pass" ? "pass" : "look at this"}</td><td>${esc(c.detail)}${c.fix ? `<br><span class="muted">${esc(c.fix)}</span>` : ""}</td></tr>`,
    )
    .join("\n");
  const llms = check.checks.find((c) => c.id === "llms");
  return `<h2>Can an engine read the site at all</h2>
<div class="scroll"><table>
<tr><th>Check</th><th>Result</th><th>What we saw</th></tr>
${rows}
</table></div>
${llms ? `<p class="muted">Footnote, not a finding: ${esc(llms.detail)}</p>` : ""}
<p class="muted">These are pass or fail checks on one page. There is no score, because a score would average away the one thing that matters.</p>`;
}

function cardHtml(card, { disclosure }) {
  if (!card.asked) {
    return `<div class="finding"><h3>${esc(card.slot.replace(/_/g, " "))}</h3>
<p class="muted">Not asked. This question needs ${esc((card.skippedFor || []).join(" and ").toLowerCase())}, and you did not give it. Add it on the form and run it again.</p></div>`;
  }
  if (card.error) {
    return `<div class="finding"><h3>${esc(card.slot.replace(/_/g, " "))}</h3>
<p><strong>Question asked:</strong> ${esc(card.text)}</p>
<p class="muted">No answer came back: ${esc(card.error)}. Nothing is inferred from a failed call.</p></div>`;
  }
  return `<div class="finding">
<h3>${esc(card.slot.replace(/_/g, " "))}${card.labels ? ` <span class="mono">${esc(card.labels.join(", "))}</span>` : ""}</h3>
<p><strong>Question asked:</strong> ${esc(card.text)}</p>
<blockquote>${esc(card.answer || "").slice(0, 1800)}</blockquote>
<p class="muted">${esc(card.engine)}, ${esc(card.askedAt)}. ${esc(disclosure)}</p>
${card.usedFallback ? `<p class="muted">This is the published fallback wording for this slot, because you did not give the value the first version needs.</p>` : ""}
</div>`;
}

function verdictHtml({ panelRan, cards, elig, brand }) {
  const blocked = elig.checks.find((c) => c.id === "crawlers" && c.status !== "pass");
  const factMisses = cards.filter((c) => (c.labels || []).includes("does not carry your fact"));
  const silent = cards.filter((c) => (c.labels || []).includes("silent"));
  const qualifying = Boolean(blocked) || factMisses.length > 0;

  let verdict;
  if (qualifying) {
    verdict = blocked
      ? "An engine we query is blocked from reading this site, so its answers cannot rest on anything you publish."
      : "An answer on this panel does not carry a fact you told us should be true.";
  } else if (panelRan && silent.length) {
    verdict = `${brand} was not named on ${silent.length} of the questions on this run.`;
  } else if (panelRan) {
    verdict = RECORD.copy.clean_verdict;
  } else {
    verdict = "The answer panel did not run on this request, so nothing here is a verdict about what any engine says.";
  }

  let next;
  if (qualifying) {
    next = `<div class="card">
<h3>What the paid audit adds</h3>
<p>${panelRan ? "This page asked five questions once, on one surface." : "This page ran the readability checks only."} The <a href="/pay/audit">AI Answer Audit</a> asks the full frozen panel across named engines, more than once, logged out, and a human writes the defect register with the source page behind each wrong sentence. It carries four printed refund classes and its fee applies in full to a sprint started within 30 days.</p>
<p><a href="/pay/audit">See what the audit includes and what it costs</a></p>
</div>`;
  } else if (panelRan && silent.length) {
    next = `<p>Not named is not the same as named wrong. Telling those apart is what the paid census does, and it is the honest reason to buy one: <a href="/pay/audit">the audit</a>. Before that, the <a href="/audit/samedaydesk/2026-08-19/">published sample</a> shows exactly what you would get.</p>`;
  } else if (panelRan) {
    next = `<p>Nothing to sell you today. If you want to see what a report looks like when something is wrong, the <a href="/audit/samedaydesk/2026-08-19/">self-audit of this site</a> is the wounded version, published while the findings were still live.</p>
<p class="muted">The panel here is small and answers vary between runs. If a customer shows you a wrong sentence, paste it into the form and run it again after the stored copy expires.</p>`;
  } else {
    next = `<p>When the answer panel is switched off, this page reports the checks it can actually run and nothing else. The <a href="/audit/samedaydesk/2026-08-19/">published self-audit</a> shows the full method.</p>`;
  }

  return `<h2>Verdict</h2>
<div class="finding${qualifying ? "" : " clean"}"><p class="lede">${esc(verdict)}</p></div>
${next}`;
}

router.post("/", async (req, res) => {
  const body = req.body || {};
  const brand = String(body.brand || "").trim().slice(0, 120);
  const rawUrl = String(body.site_url || "").trim();
  if (!rawUrl || !brand) {
    return res.status(400).type("html").send(
      shell({
        title: "Two fields are needed",
        noindex: true,
        body: `<h1>Two fields are needed</h1><p>The website address and the brand name buyers say. Everything else is optional.</p><div class="card">${formHtml({ values: body })}</div>`,
      }),
    );
  }

  const ip = (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() || req.ip || "";
  let domain = "";
  try {
    domain = registrableDomain(new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`).hostname);
  } catch {
    domain = registrableDomain(rawUrl);
  }

  capture("report_requested", { domain, had_paste: Boolean(body.quote), had_fact: Boolean(body.fact) });

  res.status(200);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  res.write(head({ brand, siteUrl: rawUrl }));
  res.flush?.();

  // Phase 1: eligibility, from the same checker the public tool runs.
  let elig;
  try {
    elig = await runCheck(rawUrl);
  } catch (e) {
    res.write(`<div class="finding"><h2>We could not read that site</h2>
<p>${esc(e?.message || "The request failed")}. Nothing else on this page would mean anything if we cannot fetch the page, so we stopped here rather than spend a model call on it.</p>
<p><a href="/report">Try another address</a></p></div>`);
    res.end(tail);
    capture("report_delivered", { domain, outcome: "fetch_failed" });
    return;
  }
  res.write(eligibilityHtml(elig));
  res.flush?.();
  capture("report_eligibility_ready", { domain });

  // Phase 2: the answer panel, if this deployment has it and the bounds allow it.
  let cards = [];
  let panelRan = false;
  if (!isPanelOn()) {
    res.write(`<h2>What AI said</h2>
<p class="muted">The answer panel is not switched on for this deployment, so no engine was queried and no quote appears below. The checks above are the whole of this report.</p>`);
  } else {
    const turnstile = await verifyTurnstile(body["cf-turnstile-response"], ip);
    const bounds = turnstile.ok
      ? await checkBounds({ domain, ip, budgetCapCents: BUDGET_CENTS })
      : { mode: "eligibility_only", reason: "The browser check did not pass, so the answer panel stayed closed for this request." };

    if (bounds.mode === "cache" && bounds.payload?.cards) {
      res.write(`<h2>What AI said</h2><p class="muted">${esc(bounds.reason)} Stored at ${esc(bounds.cachedAt || "")}.</p>`);
      cards = bounds.payload.cards;
      for (const card of cards) res.write(cardHtml(card, { disclosure: RECORD.panel.disclosure }));
      panelRan = true;
    } else if (bounds.mode === "live") {
      res.write(`<h2>What AI said</h2><p class="muted">Five questions, asked once each, in the order below. Each card names the surface and the time.</p>`);
      const slots = {
        BUSINESS: brand,
        SERVICE: String(body.service || "").trim(),
        COMPETITOR: String(body.competitor || "").trim(),
        CATEGORY: String(body.category || "").trim(),
        CITY: String(body.city || "").trim(),
      };
      cards = await runPanel({
        slots,
        brand,
        fact: String(body.fact || "").trim(),
        onCard: async (card) => {
          res.write(cardHtml(card, { disclosure: RECORD.panel.disclosure }));
          res.flush?.();
        },
      });
      panelRan = true;
      await recordRun({ domain, ip, payload: { cards, brand, model: openaiModel() } });
    } else {
      res.write(`<h2>What AI said</h2><p class="muted">${esc(bounds.reason)}</p>`);
    }
  }

  if (String(body.quote || "").trim()) {
    res.write(`<h2>The sentence you pasted</h2>
<blockquote>${esc(String(body.quote).slice(0, 800))}</blockquote>
<p class="muted">We did not verify where that sentence came from. In the paid audit that sentence becomes a question in the panel and the source hunt starts from it.</p>`);
  }

  res.write(`<h2>What we checked and what we did not</h2>
<p>Asked: ${panelRan ? `${cards.filter((c) => c.asked).length} of the five frozen questions` : "no questions, because the panel did not run"}. On one surface, once each.</p>
<p>Not done here: the full frozen panel across named engines, more than once, logged out, with a human register and the source page behind each wrong sentence. That is the paid census, and this page does not pretend to be it.</p>`);

  res.write(verdictHtml({ panelRan, cards, elig, brand }));
  res.write(tail);
  res.end();
  capture("report_delivered", { domain, panel: panelRan, cards: cards.length });
});

export default router;
