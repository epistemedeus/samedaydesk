import { randomUUID } from "node:crypto";
import { newIntegrationId } from "./care-contract.js";

// Anchor billing to the original UTC day, clamping at shorter calendar months.
export function nextBillingMonth(current, first) {
  const next = new Date(current);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 2, 0);
  next.setUTCDate(Math.min(next.getUTCDate(), new Date(first).getUTCDate()));
  return next;
}

export async function recordUsdcMonth(db, table, row, at) {
  const orders = table("care_orders"), periods = table("care_periods");
  const parent = row.rail_parent ? (await db.query(`select * from ${orders} where id=$1 for update`, [row.rail_parent])).rows[0] : row;
  const start = row.rail_period_start ?? at;
  const end = nextBillingMonth(start, parent.received_at ?? at);
  const { rowCount } = await db.query(`insert into ${periods}(invoice_id,order_id,period_start,period_end,status)
    values ($1,$2,$3,$4,'ready') on conflict do nothing`, [row.rail_id, parent.id, start, end]);
  if (!rowCount) throw Error("service period already funded");
  if (parent.cancel_at_period_end || parent.state !== "paid") return;
  // The next invoice has no payer authorization. The existing mail worker sends its link
  // when the period opens; it cannot charge the wallet.
  const next = (await db.query(`insert into ${orders}
    (id,offer,amount_cents,live_mode,checkout_expires_at,checkout_origin,integration_id,journey_session,checkout_rail,rail_id,
     rail_email,rail_parent,rail_period_start)
    values ($1,'keep_it_working',$2,$3,$4,$5,$6,$7,'usdc',$8,$9,$10,$11) returning rail_id`,
    [randomUUID(), parent.amount_cents, parent.live_mode, nextBillingMonth(end, parent.received_at ?? at), parent.checkout_origin,
      newIntegrationId(), parent.journey_session, randomUUID(), parent.rail_email, parent.id, end])).rows[0];
  await db.query(`insert into ${table("care_mail")}(mail_key,order_id,kind,details,next_attempt_at)
    values ($1,$2,'monthly_invoice',$3,$4) on conflict do nothing`, [`invoice/${next.rail_id}`, parent.id,
    { paymentUrl: "https://agents.samedaydesk.com/order-payments/sds/" + next.rail_id, start: end.toISOString() }, end]);
}
