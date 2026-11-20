// Resend transactional email. Null until configured (mirrors the playbook pattern).
import { Resend } from "resend";
import { appendFile } from "node:fs/promises";
import { isAbsolute } from "node:path";

const key = process.env.RESEND_API_KEY;
const preview = process.env.SDS_PRIVATE_PREVIEW === "1";
const outbox = process.env.SDS_PREVIEW_MAIL_OUTBOX;
if (outbox && (!preview || !isAbsolute(outbox))) throw new Error("A mail outbox requires an isolated private preview path");
export const FROM = process.env.RESEND_FROM_EMAIL || "SameDayDesk <contact@samedaydesk.com>";
export const ownSender = (from) => typeof from === "string" && !/[\r\n]/.test(from) &&
  /^[^\s@<>]+@(?:[a-z0-9-]+\.)*samedaydesk\.com$/i.test(/^[^<>]*<([^<>]+)>$/.exec(from)?.[1] ?? from);
if (!ownSender(FROM)) throw new Error("SameDayDesk transactional mail needs a SameDayDesk sender");
const local = outbox && { emails: { async send(message) {
  const recipients = Array.isArray(message.to) ? message.to : [message.to];
  if (!recipients.every((to) => typeof to === "string" && /@[^\s@]+\.test$/i.test(to))) {
    return { error: { message: "Preview mail only accepts synthetic recipients" } };
  }
  await appendFile(outbox, JSON.stringify(message) + "\n", { mode: 0o600 });
  return { data: { id: "private-outbox" }, error: null };
} } };
// Even with NODE_ENV=production, a private preview has no Resend network send path.
export const resend = preview ? (local || null) : key && key !== "later" ? new Resend(key) : null;
export const isEmailConfigured = () => resend !== null;
