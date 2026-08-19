import { Router } from "express";
import { getOffer, RECORD, clockSentence } from "../pricing.js";
import { verifySession } from "./checkout.js";
import { saveIntake } from "../lib/orders.js";
import { sendTemplate } from "../lib/notify.js";
import { intakeComplete, sprintAccess } from "../emails/index.js";
import { shell, esc } from "../lib/layout.js";
import { nextBusinessMorning } from "../lib/clock.js";

// Post-payment intake. Server rendered, works with no JavaScript, keyed by the Stripe
// session id. The clock starts here, not at payment, and the page says so.
const router = Router();

const SPRINT_SLUGS = new Set(["correction_sprint", "correction_sprint_plus"]);

function field({ id, label, hint, type = "text", value = "", required = true, placeholder = "" }) {
  const input =
    type === "textarea"
      ? `<textarea id="${id}" name="${id}" ${required ? "required" : ""} placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
      : `<input type="${type}" id="${id}" name="${id}" value="${esc(value)}" ${required ? "required" : ""} placeholder="${esc(placeholder)}">`;
  return `<div class="row"><label for="${id}">${esc(label)}</label>${input}${hint ? `<p class="hint">${esc(hint)}</p>` : ""}</div>`;
}

function intakeForm({ sessionId, slug, meta }) {
  const isSprint = SPRINT_SLUGS.has(slug);
  const offer = getOffer(slug);
  return `
<h1>Start the clock</h1>
<p class="lede">You paid for the ${esc(offer.label)}. This form is the other half. ${esc(clockSentence(slug))}</p>

<div class="card">
  <h2>What you already gave us</h2>
  <table>
    <tr><th>Website</th><td class="mono">${esc(meta.site_url || "")}</td></tr>
    <tr><th>Brand name</th><td>${esc(meta.brand_name || "")}</td></tr>
    <tr><th>Delivery email</th><td class="mono">${esc(meta.delivery_email || "")}</td></tr>
  </table>
  <p class="hint">If any of these is wrong, correct it in the notes field at the end and we will use the corrected value.</p>
</div>

<form method="post" action="/api/intake">
<input type="hidden" name="session_id" value="${esc(sessionId)}">

<fieldset>
  <legend>Your market and your words</legend>
  ${field({ id: "city", label: "Primary city or market", placeholder: "the city buyers mean when they say near me" })}
  ${field({ id: "category", label: "The word buyers type for what you are", hint: "Plumber, property manager, plastics supplier. Not your internal service-menu wording.", placeholder: "plumber" })}
  ${field({ id: "service", label: "One flagship service you actually sell", placeholder: "emergency drain clearing" })}
</fieldset>

<fieldset>
  <legend>Who you are compared with</legend>
  <p class="hint">Real names, as buyers say them. If we miss a competitor you name here and the engines recommend it on the panel questions, that is one of the printed refund classes.</p>
  ${field({ id: "competitor_1", label: "Competitor 1" })}
  ${field({ id: "competitor_2", label: "Competitor 2" })}
  ${field({ id: "competitor_3", label: "Competitor 3" })}
</fieldset>

<fieldset>
  <legend>The questions you already hear</legend>
  ${field({ id: "buyer_questions", label: "Five to ten questions buyers actually ask you", type: "textarea", hint: "One per line. The questions you answer on the phone every week, in their words.", placeholder: "Do you work on weekends?\nHow much is a callout?\nDo you still do commercial jobs?" })}
</fieldset>

<fieldset>
  <legend>Facts an answer must not contradict</legend>
  <p class="hint">Thin is fine. If you leave something blank we write "the buyer did not give us a canonical value" on any card that touches it, rather than chasing you.</p>
  ${field({ id: "fact_legal_name", label: "Legal name", required: false })}
  ${field({ id: "fact_dba", label: "Trading name or DBA", required: false })}
  ${field({ id: "fact_phone", label: "Phone number", required: false })}
  ${field({ id: "fact_hours", label: "Hours", required: false, placeholder: "Mon to Fri 8 to 6, Sat 9 to 1" })}
  ${field({ id: "fact_address", label: "Address", required: false })}
  ${field({ id: "fact_not_sold", label: "Things you do not sell but get asked about", required: false, placeholder: "we stopped doing residential in 2024" })}
  ${field({ id: "fact_relocated_from", label: "Previous city, if you moved", required: false })}
</fieldset>

${isSprint ? sprintBlock() : ""}

<fieldset>
  <legend>Anything else</legend>
  ${field({ id: "notes", label: "Notes, corrections, or context", type: "textarea", required: false, placeholder: "optional" })}
</fieldset>

<button type="submit">Submit and start the clock</button>
<p class="hint">${esc(RECORD.clock_sentence)} The next business morning after this form is complete is when day one begins.</p>
</form>`;
}

function sprintBlock() {
  return `
<fieldset>
  <legend>Sprint: access and scope</legend>
  <p class="hint">We never need a password. The clock waits for this section, or for the public-only waiver below.</p>
  ${field({ id: "cms", label: "What runs your site", placeholder: "WordPress, Shopify, Squarespace, Webflow, Wix, other, or we will paste files ourselves" })}
  ${field({ id: "approver", label: "One named approver", hint: "The person who can say yes to the frozen change list.", placeholder: "name and email" })}
  ${field({ id: "change_list", label: "What you want fixed first", type: "textarea", hint: "Up to eight items. If you bought the audit first, say so and we work from its punch list.", placeholder: "one per line" })}
  <div class="check">
    <input type="checkbox" id="public_only_waiver" name="public_only_waiver" value="yes">
    <label for="public_only_waiver">Public-only waiver: do not ask me for logins. Hand me the files and the instructions and I will publish them myself. Tickets that need a login get marked as submitted instructions rather than shipped work.</label>
  </div>
</fieldset>

<fieldset>
  <legend>Founding cohort documentation (optional, draft)</legend>
  <p class="hint">Separate boxes, none of them required, none of them a condition of the price or of anything we say about the result. The operative language is with counsel; this form records your preference and nothing is published without your written approval of an actual draft.</p>
  <div class="check"><input type="checkbox" id="cs_artifacts" name="cs_artifacts" value="yes"><label for="cs_artifacts">You may keep the dated before and after artifacts from my sprint as method evidence, with my name removed.</label></div>
  <div class="check"><input type="checkbox" id="cs_named" name="cs_named" value="yes"><label for="cs_named">You may ask me later about a named write-up. I will see the draft first and can say no then.</label></div>
  <div class="check"><input type="checkbox" id="cs_reference" name="cs_reference" value="yes"><label for="cs_reference">You may ask me to take a reference call from a prospective buyer.</label></div>
</fieldset>`;
}

router.get("/", async (req, res) => {
  const sessionId = String(req.query.session_id || "");
  const result = await verifySession(sessionId);
  if (!result.ok || !getOffer(result.slug)) {
    return res
      .status(400)
      .type("html")
      .send(
        shell({
          title: "We could not find that order",
          noindex: true,
          body: `<h1>We could not find that order</h1>
<p>This page needs the session id Stripe sends you back with. If you paid and landed here anyway, forward your receipt to <a href="mailto:contact@samedaydesk.com">contact@samedaydesk.com</a> and we will send the form by hand. Nothing is lost.</p>
<p><a href="/#offers">Back to the offers</a></p>`,
        }),
      );
  }
  if (!result.paid) {
    return res.status(402).type("html").send(
      shell({
        title: "That payment is not settled yet",
        noindex: true,
        body: `<h1>That payment is not settled yet</h1>
<p>Stripe has not confirmed the payment on this session. Give it a minute and reload. If it stays like this, email <a href="mailto:contact@samedaydesk.com">contact@samedaydesk.com</a>.</p>`,
      }),
    );
  }
  res.type("html").send(
    shell({
      title: "Start the clock",
      noindex: true,
      body: intakeForm({ sessionId, slug: result.slug, meta: result.meta || {} }),
    }),
  );
});

// Complete-intake rule: the market words, the three competitors, the buyer questions, and
// at least one canonical fact. Field 11 may be thin; it may not be empty.
export function validateIntake(body) {
  const missing = [];
  const need = { city: "primary city or market", category: "the word buyers type", service: "one flagship service", competitor_1: "competitor 1", competitor_2: "competitor 2", competitor_3: "competitor 3" };
  for (const [k, label] of Object.entries(need)) if (!String(body[k] || "").trim()) missing.push(label);
  const questions = String(body.buyer_questions || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (questions.length < 5) missing.push("at least five buyer questions, one per line");
  if (questions.length > 10) missing.push("no more than ten buyer questions");
  const facts = ["fact_legal_name", "fact_dba", "fact_phone", "fact_hours", "fact_address", "fact_not_sold", "fact_relocated_from"];
  if (!facts.some((f) => String(body[f] || "").trim())) missing.push("at least one canonical fact");
  return { ok: missing.length === 0, missing, questions };
}

router.post("/", async (req, res) => {
  const body = req.body || {};
  const sessionId = String(body.session_id || "");
  const result = await verifySession(sessionId);
  if (!result.ok || !result.paid || !getOffer(result.slug)) {
    return res.status(400).type("html").send(
      shell({
        title: "We could not match that order",
        noindex: true,
        body: `<h1>We could not match that order</h1><p>Nothing was lost. Forward your receipt to <a href="mailto:contact@samedaydesk.com">contact@samedaydesk.com</a> and we will take the intake by email.</p>`,
      }),
    );
  }
  const check = validateIntake(body);
  if (!check.ok) {
    return res.status(400).type("html").send(
      shell({
        title: "The form is not complete yet",
        noindex: true,
        body: `<h1>The form is not complete yet</h1>
<p>The clock starts on a complete form, so we would rather send you back than start on half of one. Still needed:</p>
<ul>${check.missing.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
<p><a href="/intake?session_id=${encodeURIComponent(sessionId)}">Back to the form</a></p>`,
      }),
    );
  }

  const fields = {
    site_url: result.meta?.site_url || "",
    brand_name: result.meta?.brand_name || "",
    delivery_email: result.meta?.delivery_email || "",
    city: body.city,
    category: body.category,
    service: body.service,
    competitors: [body.competitor_1, body.competitor_2, body.competitor_3],
    buyer_questions: check.questions,
    canonical_facts: {
      legal_name: body.fact_legal_name || "",
      dba: body.fact_dba || "",
      phone: body.fact_phone || "",
      hours: body.fact_hours || "",
      address: body.fact_address || "",
      not_sold: body.fact_not_sold || "",
      relocated_from: body.fact_relocated_from || "",
    },
    sprint: SPRINT_SLUGS.has(result.slug)
      ? {
          cms: body.cms || "",
          approver: body.approver || "",
          change_list: String(body.change_list || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
          public_only_waiver: body.public_only_waiver === "yes",
          case_study: {
            artifacts: body.cs_artifacts === "yes",
            named: body.cs_named === "yes",
            reference_call: body.cs_reference === "yes",
          },
        }
      : null,
    notes: body.notes || "",
    submitted_at: new Date().toISOString(),
  };

  await saveIntake({ sessionId, slug: result.slug, fields });

  const startsOn = nextBusinessMorning(new Date());
  const to = result.meta?.delivery_email;
  sendTemplate(to, intakeComplete({ slug: result.slug, startsOn })).catch(() => {});
  if (SPRINT_SLUGS.has(result.slug)) sendTemplate(to, sprintAccess({ slug: result.slug })).catch(() => {});

  res.type("html").send(
    shell({
      title: "Clock started",
      noindex: true,
      body: `<h1>Clock started</h1>
<p class="lede">Day one is ${esc(startsOn)}. ${esc(getOffer(result.slug).clockText)}.</p>
<p>A confirmation is on its way to <span class="mono">${esc(to || "your delivery address")}</span> with the same dates. You do not need to do anything else.</p>
<p>If something in your intake does not parse, we pause the clock and send one question rather than guessing. That is the only email you should expect before delivery.</p>
<p><a href="/methods">How the measurement works</a> and <a href="/terms">what acceptance means</a>.</p>`,
    }),
  );
});

export default router;
