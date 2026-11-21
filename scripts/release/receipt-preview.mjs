// A single paid preview receipt, using the existing restricted brand sender.
import { Resend } from "resend";
import { openCareStore } from "../../server/lib/care-store.js";
import { drainCareMail } from "../../server/lib/care-mail.js";
import { FROM, resend } from "../../server/lib/resend.js";
import { isOrderId } from "../../server/lib/care-contract.js";

const id = process.argv[2];
if (process.env.SDS_PRIVATE_PREVIEW !== "1" || process.env.SDS_PREVIEW_RESEND !== "1" || !isOrderId(id)) {
  throw new Error("An isolated paid preview receipt is required");
}
const store = openCareStore();
try {
  const order = await store.order(id);
  if (order?.state !== "paid" || order.live_mode !== false || order.stripe_email !== "contact@samedaydesk.com" || !order.payment_intent_id) {
    throw new Error("The exact stored test payment and owned mailbox are required");
  }
  const messages = [];
  const counts = await drainCareMail({ store: { order: (...args) => store.order(...args),
    acceptMail: (...args) => store.acceptMail(...args), nextMail: async () => {
      const item = await store.nextMail();
      if (item && (item.order_id !== id || item.kind !== "receipt")) throw new Error("Only the selected receipt may be sent");
      return item;
    } }, limit: 1, secret: process.env.SDS_CARE_ACCESS_SECRET, from: FROM, replyTo: "contact@samedaydesk.com",
    send: async (...args) => {
      const result = await resend.emails.send(...args);
      if (result.data?.id) messages.push({ id: result.data.id });
      return result;
    } });
  const api = new Resend(process.env.RESEND_API_KEY);
  for (const message of messages) {
    const read = await api.emails.get(message.id);
    message.readback = { id: read.data?.id ?? null, last_event: read.data?.last_event ?? null, error: read.error?.name ?? null };
  }
  console.log(JSON.stringify({ ...counts, orderId: id, ownBrandMailbox: true, messages }));
  if (counts.accepted !== 1 || counts.deferred) process.exitCode = 1;
} finally { await store?.close(); }
