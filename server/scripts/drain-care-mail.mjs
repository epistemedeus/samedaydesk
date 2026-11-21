import { openCareStore } from "../lib/care-store.js";
import { drainCareMail } from "../lib/care-mail.js";
import { FROM, ownSender, resend } from "../lib/resend.js";

const secret = process.env.SDS_CARE_ACCESS_SECRET || "";
const replyTo = process.env.RESEND_REPLY_TO || "contact@samedaydesk.com";
if (process.env.SDS_CARE_CHECKOUT !== "1" || !resend || Buffer.byteLength(secret) < 32 || !ownSender(replyTo)) {
  throw new Error("Set up the care checkout and its SameDayDesk reply address before draining mail.");
}
const store = openCareStore();
if (!store) throw new Error("Set up the care database before draining mail.");
try {
  const counts = await drainCareMail({ store, secret, from: FROM, replyTo, send: (...args) => resend.emails.send(...args) });
  console.log(JSON.stringify(counts));
  if (counts.deferred) process.exitCode = 1;
} finally { await store.close(); }
