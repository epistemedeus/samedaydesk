import { CARE_OFFERS, careLink } from "./care-contract.js";
import { recordCommerceJourney } from "./commerce-journey.js";

const day = (value) => new Date(value).toISOString().slice(0, 10);

export function careMailMessage({ order, item, secret, from, replyTo }) {
  const offer = CARE_OFFERS[order.offer];
  const scopeLink = careLink(order, secret);
  const cancelLink = offer.mode === "subscription" ? careLink(order, secret, "cancel") : null;
  let subject, text;
  if (item.kind === "receipt") {
    subject = "Your SameDayDesk receipt";
    text = `${offer.title}\nPaid: ${(order.amount_cents / 100).toFixed(0)} USD.\n\nTell us what to work on: ${scopeLink}`;
    if (cancelLink) text += `\n\nManage or cancel renewal: ${cancelLink}`;
  } else if (item.kind === "intake") {
    subject = "We received your workflow";
    text = "Your workflow is attached to your order. Reply to this email if you need to add anything.";
  } else if (item.kind === "cancellation") {
    subject = "Your SameDayDesk subscription won't renew";
    text = "Your subscription is set not to renew. Reply to this email if you have any questions.";
  } else if (item.kind === "report") {
    const { start, end, package: spec, checks } = item.details;
    subject = "Your monthly Keep it working report";
    text = [
      `${spec}, paid period ${day(start)} to ${day(end)} (UTC).`, "",
      ...checks.map((check) => `${check.os}: ${check.passed ? "Passed" : "Needs attention"}. ${check.note}`),
      "", "Reply if you would like help with an issue in this report.",
    ].join("\n");
  } else throw new Error("Unexpected mail kind");
  return { from, replyTo, to: order.stripe_email, subject, text };
}

export async function drainCareMail({ store, send, secret, from, replyTo, limit = 20 }) {
  let accepted = 0, deferred = 0;
  for (let i = 0; i < limit; i++) {
    const item = await store.nextMail();
    if (!item) break;
    try {
      const order = await store.order(item.order_id);
      if (!order?.stripe_email) throw new Error("No receipt email");
      const message = careMailMessage({ order, item, secret, from, replyTo });
      const result = await send(message, { idempotencyKey: `sameday-care/${item.mail_key}` });
      if (result.error || !result.data?.id) throw new Error("Mail not confirmed");
      await store.acceptMail(item.mail_key, item.claim_id, result.data.id);
      if (item.kind === "receipt") await recordCommerceJourney("receipt_sent", {
        key: item.mail_key, orderId: order.id, sessionId: order.journey_session || order.id, live: order.live_mode,
      });
      accepted++;
    } catch { deferred++; }
  }
  return { accepted, deferred };
}
