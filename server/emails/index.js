// Transactional copy for the four answer-correction offers. Plain text first, with a
// minimal HTML twin. No marketing footer beyond the legal identity line.
import { RECORD, getOffer, clockSentence } from "../pricing.js";

const SITE = RECORD.site.url;
const IDENTITY = `${RECORD.site.name} is a trading name of ${RECORD.site.legal_name}, ${RECORD.site.jurisdiction}. Operated by ${RECORD.site.operator}. Reply to this email and a person reads it.`;

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function html(bodyLines) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:34rem;margin:auto;padding:24px;color:#191919;line-height:1.6">
${bodyLines.map((l) => (l.startsWith("<") ? l : `<p>${esc(l)}</p>`)).join("\n")}
<p style="color:#56534c;font-size:12px;margin-top:24px">${esc(IDENTITY)}</p>
</div>`;
}

function text(lines) {
  return lines.filter((l) => !l.startsWith("<")).join("\n\n") + `\n\n${IDENTITY}\n`;
}

// 1. Payment confirmation, per offer, carrying the intake link and the clock sentence.
export function paymentConfirmation({ slug, sessionId }) {
  const offer = getOffer(slug);
  const intakeUrl = `${SITE}/intake?session_id=${encodeURIComponent(sessionId)}`;
  const lines = [
    `Your payment for the ${offer.label} went through.`,
    "One thing left before the clock starts: the intake form. It asks for the market, the words your buyers use, the competitors you want checked, the questions you already hear, and the facts an answer must not contradict.",
    `Open the intake: ${intakeUrl}`,
    clockSentence(slug),
    "If anything in the form does not apply to your business, say so in the field and we will work around it rather than chase you for it.",
  ];
  return {
    subject: `${offer.label}: one form to start the clock`,
    text: text(lines),
    html: html([...lines.slice(0, 2), `<p><a href="${intakeUrl}">Open the intake form</a></p>`, ...lines.slice(3)]),
  };
}

// 2. Intake complete, stating when the clock actually started.
export function intakeComplete({ slug, startsOn }) {
  const offer = getOffer(slug);
  const lines = [
    `Your intake for the ${offer.label} is complete.`,
    `The clock starts on the next business morning, ${startsOn}, and runs ${offer.clockText.toLowerCase()}.`,
    `Business days are ${RECORD.clocks.business_days}.`,
    "You do not need to do anything else. If we hit something in your intake that does not parse, we pause the clock and send one question rather than guessing.",
  ];
  return { subject: `${offer.label}: clock started`, text: text(lines), html: html(lines) };
}

// 3. One-shot recovery for a paid order with no intake after 24 hours.
export function intakeRecovery({ slug, sessionId }) {
  const offer = getOffer(slug);
  const intakeUrl = `${SITE}/intake?session_id=${encodeURIComponent(sessionId)}`;
  const lines = [
    `You paid for the ${offer.label} yesterday and the intake form is still open.`,
    "Nothing is wrong and nothing expired. The clock simply has not started, because it starts on a complete form rather than on the payment.",
    `Finish it here: ${intakeUrl}`,
    "This is the only reminder we send about it. If you would rather have the money back, reply to this email and say so; work has not started.",
  ];
  return {
    subject: `${offer.label}: the intake form is still open`,
    text: text(lines),
    html: html([...lines.slice(0, 2), `<p><a href="${intakeUrl}">Finish the intake form</a></p>`, lines[3]]),
  };
}

// 4. Sprint access checklist, sent after a sprint intake completes.
export function sprintAccess({ slug }) {
  const offer = getOffer(slug);
  const lines = [
    `Next step for the ${offer.label}: access.`,
    "We never need a password. Invite our working account and remove it on delivery day. The last page of the sprint is a revoke checklist.",
    "<ul><li>Your CMS: create a user with editor-level rights, or tick the public-only waiver and we hand you files to paste yourself.</li><li>Business profile: invite as Manager, never Owner. Only needed if a profile fact is on the frozen list.</li><li>Search Console: Restricted, or Full if a crawler or sitemap ticket is on the list.</li><li>Analytics: Viewer, optional, and only if we say we looked at traffic.</li></ul>",
    "We do not ask for DNS, ads accounts, host or server logins. If a ticket needs one of those, we write it up as an instruction for you instead.",
    `The clock starts when the checklist is green or the waiver is ticked and the change list is approved. ${RECORD.clock_sentence}`,
  ];
  return { subject: `${offer.label}: how to give us access`, text: text(lines), html: html(lines) };
}
