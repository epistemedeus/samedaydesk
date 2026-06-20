// Transactional + ops notifications via Resend. All best-effort: a failure here must
// never break the user's request or fulfillment. No-ops until Resend is configured (P3).
import { resend, isEmailConfigured, FROM } from "./resend.js";

// Transactional mail sends from the mail.samedaydesk.com subdomain (protects the root
// domain's reputation); replies route to the human-monitored contact@ inbox.
const REPLY_TO = process.env.RESEND_REPLY_TO || "contact@samedaydesk.com";

const dollars = (cents) => `$${(Number(cents) / 100).toFixed(2)}`;

export async function sendReceipt({ to, label, amount, orderId }) {
  if (!isEmailConfigured() || !to) return;
  try {
    await resend.emails.send({
      from: FROM,
      replyTo: REPLY_TO,
      to,
      subject: `Your SameDayDesk order — ${label}`,
      html: receiptHtml({ label, amount, orderId }),
    });
  } catch (e) {
    console.error("[notify] receipt failed", e?.message);
  }
}

export async function sendWelcome({ to }) {
  if (!isEmailConfigured() || !to) return { skipped: true };
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      replyTo: REPLY_TO,
      to,
      subject: "Welcome to SameDayDesk",
      html: welcomeHtml(),
    });
    if (error) { console.error("[notify] welcome", error.message); return { error: error.message }; }
    return { id: data?.id };
  } catch (e) {
    console.error("[notify] welcome failed", e?.message);
    return { error: e?.message };
  }
}

export async function notifyAdmin(subject, html) {
  const admin = process.env.ADMIN_EMAIL;
  if (!isEmailConfigured() || !admin) return;
  try {
    await resend.emails.send({ from: FROM, replyTo: REPLY_TO, to: admin, subject, html });
  } catch (e) {
    console.error("[notify] admin failed", e?.message);
  }
}

function welcomeHtml() {
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:28px;color:#1a1a1a">
    <h1 style="font-size:18px;margin:0 0 8px">Welcome to SameDayDesk 👋</h1>
    <p style="color:#555">You're all set. Send us a task — a résumé, a cover letter, landing-page copy, or
    something custom — and we'll turn it around <strong>today</strong>.</p>
    <p style="color:#555">Not sure yet? Ask for a <strong>free teaser</strong> first: we'll rewrite a piece
    of your résumé free so you can judge the quality before paying a cent.</p>
    <p style="margin-top:16px"><a href="https://samedaydesk.com/dashboard"
      style="background:#0a0b0d;color:#ccff00;padding:10px 18px;border-radius:99px;text-decoration:none;font-weight:600">Go to your desk →</a></p>
    <p style="color:#888;font-size:12px;margin-top:20px">Same-day, money-back guaranteed. Just reply to this email any time.</p>
  </div>`;
}

function receiptHtml({ label, amount, orderId }) {
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:28px;color:#1a1a1a">
    <h1 style="font-size:18px;margin:0 0 8px">Thanks — we've got your order</h1>
    <p style="color:#555">We're on it. You'll receive your deliverable by email today.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px 0;color:#888">Service</td><td style="text-align:right;font-weight:600">${label}</td></tr>
      <tr><td style="padding:8px 0;color:#888">Paid</td><td style="text-align:right;font-weight:600">${dollars(amount)}</td></tr>
      <tr><td style="padding:8px 0;color:#888">Order</td><td style="text-align:right;font-family:monospace">${orderId}</td></tr>
    </table>
    <p style="color:#888;font-size:12px">SameDayDesk · same-day, money-back guaranteed. Reply to this email any time.</p>
  </div>`;
}
