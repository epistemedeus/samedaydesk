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
    const cents = BigInt(order.rail_qa_cents ?? order.amount_cents);
    const amount = cents % 100n ? `${cents / 100n}.${String(cents % 100n).padStart(2,"0")}` : String(cents / 100n);
    text = `${offer.title}\nPaid: ${amount} USD.\n\nTell us what to work on: ${scopeLink}`;
    if (item.details?.period) text += `\nService period starting ${day(item.details.period)}.`;
    if (cancelLink) text += `\n\nManage or cancel renewal: ${cancelLink}`;
  } else if (item.kind === "monthly_invoice") {
    subject = "Your monthly SameDayDesk invoice";
    text = `Keep it working, ${day(item.details.start)}. Pay 100 USDC on Base: ${item.details.paymentUrl}/wallet\n\nManage your monthly invoices: ${cancelLink}`;
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
  return { from, replyTo, to: order.rail_email || order.stripe_email, subject, text };
}

export async function queueOrderReceipt(db,table,{hostedId,quoteId,email,label,cents,paymentUrl,live,session}) {
  const id=hostedId ?? quoteId;
  await db.query(`insert into ${table("care_mail")}(mail_key,hosted_order_id,quote_id,kind,details)
    values($1,$2,$3,'order_receipt',$4) on conflict(mail_key) do nothing`,
    ["order_receipt/"+id,hostedId ?? null,quoteId ?? null,{ email,label,cents,paymentUrl,live,session }]);
}

export async function drainCareMail({ store, send, secret, from, replyTo, limit = 20 }) {
  let accepted = 0, deferred = 0;
  for (let i = 0; i < limit; i++) {
    const item = await store.nextMail();
    if (!item) break;
    try {
      let message, order;
      if (item.kind === "order_receipt") {
        const {email,label,cents,paymentUrl}=item.details;
        const units=BigInt(cents);
        message={from,replyTo,to:email,subject:"Your SameDayDesk receipt",
          text:`${label}\nPaid ${units / 100n}.${String(units % 100n).padStart(2,"0")} USDC on Base.\n\nView your payment and receipt: ${paymentUrl}/wallet`};
      } else {
        order = await store.order(item.order_id);
        if (!order?.rail_email && !order?.stripe_email) throw new Error("No receipt email");
        message = careMailMessage({ order, item, secret, from, replyTo });
      }
      const result = await send(message, { idempotencyKey: `sameday-care/${item.mail_key}` });
      if (result.error || !result.data?.id) throw new Error("Mail not confirmed");
      await store.acceptMail(item.mail_key, item.claim_id, result.data.id);
      if (item.kind === "receipt") await recordCommerceJourney("receipt_sent", {
        key: item.mail_key, orderId: order.id, sessionId: order.journey_session || order.id, live: order.live_mode && order.rail_qa_cents == null,
      });
      if (item.kind === "order_receipt") await recordCommerceJourney("receipt_sent",{
        key:item.mail_key,orderId:item.hosted_order_id ?? item.quote_id,sessionId:item.details.session,live:item.details.live
      });
      accepted++;
    } catch { deferred++; }
  }
  return { accepted, deferred };
}
