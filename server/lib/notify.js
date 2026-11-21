// Transactional + ops notifications via Resend. All best-effort: a failure here must
// never break the user's request or fulfillment. No-ops until Resend is configured (P3).
import { resend, isEmailConfigured, FROM, ownSender } from "./resend.js";

// Transactional mail sends from the mail.samedaydesk.com subdomain (protects the root
// domain's reputation); replies route to the human-monitored contact@ inbox.
const REPLY_TO = process.env.RESEND_REPLY_TO || "contact@samedaydesk.com";
if (!ownSender(REPLY_TO)) throw new Error("SameDayDesk transactional mail needs its own reply address");

const dollars = (cents) => `${(Number(cents) / 100).toFixed(2)} USD`;

export async function sendReceipt({ to, label, amount, orderId }) {
  if (!isEmailConfigured() || !to) return;
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      replyTo: REPLY_TO,
      to,
      subject: `Your SameDayDesk order: ${label}`,
      html: receiptHtml({ label, amount, orderId }),
    }, { idempotencyKey: `order-receipt/${orderId}` });
    if (error) console.error("[notify] receipt refused");
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
    const { error } = await resend.emails.send({ from: FROM, replyTo: REPLY_TO, to: admin, subject, html });
    if (error) console.error("[notify] admin refused");
  } catch (e) {
    console.error("[notify] admin failed", e?.message);
  }
}

export async function sendTaskRequestReceived({ to, reference }) {
  if (!isEmailConfigured() || !to) return;
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      replyTo: REPLY_TO,
      to,
      subject: `We have your task (${reference})`,
      html: taskRequestHtml({ reference }),
    }, { idempotencyKey: `task-received/${reference}` });
    if (error) console.error("[notify] task request refused");
  } catch (e) {
    console.error("[notify] task request failed", e?.message);
  }
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function taskRequestHtml({ reference }) {
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:28px;color:#1a1a1a">
    <h1 style="font-size:18px;margin:0 0 8px">We have your task</h1>
    <p style="color:#555">You will get a written scope and a fixed price by email, with a link to pay when you
    are happy with it. Nothing is charged before that.</p>
    <p style="color:#888;font-size:12px">Reference ${escapeHtml(reference)}. Reply to this email to add anything.</p>
  </div>`;
}

function welcomeHtml() {
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:28px;color:#1a1a1a">
    <h1 style="font-size:18px;margin:0 0 8px">Welcome to SameDayDesk 👋</h1>
    <p style="color:#555">Your desk is ready. Choose a service, send your task, and follow your order from your dashboard.</p>
    <p style="margin-top:16px"><a href="https://samedaydesk.com/dashboard"
      style="background:#0a0b0d;color:#ccff00;padding:10px 18px;border-radius:99px;text-decoration:none;font-weight:600">Go to your desk →</a></p>
    <p style="color:#888;font-size:12px;margin-top:20px">Need help choosing? Reply to this email.</p>
  </div>`;
}

function receiptHtml({ label, amount, orderId }) {
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:28px;color:#1a1a1a">
    <h1 style="font-size:18px;margin:0 0 8px">We received your order</h1>
    <p style="color:#555">Keep this receipt for your records.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px 0;color:#888">Service</td><td style="text-align:right;font-weight:600">${escapeHtml(label)}</td></tr>
      <tr><td style="padding:8px 0;color:#888">Paid</td><td style="text-align:right;font-weight:600">${dollars(amount)}</td></tr>
      <tr><td style="padding:8px 0;color:#888">Order</td><td style="text-align:right;font-family:monospace">${escapeHtml(orderId)}</td></tr>
    </table>
    <p style="color:#888;font-size:12px">SameDayDesk. Reply to ask about your order.</p>
  </div>`;
}
