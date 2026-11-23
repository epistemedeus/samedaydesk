import { queueOrderReceipt } from "./care-mail.js";
import { createHash, randomUUID } from "node:crypto";
import { CareError, isOrderId, providerId } from "./care-contract.js";
import { getOffer } from "../pricing.js";
import { buildSellerRepairCheckoutSessionParams, isValidSellerRepairFindingId, SELLER_CONTRACT_REPAIR_SLUG } from "./seller-repair-checkout.js";
import { projectRailChange } from "./order-rail-state.js";
import { recordRailEvent } from "./care-usdc.js";

const conflict = () => new CareError(409,"Check the payment already attached to this order.");
const base = "https://agents.samedaydesk.com/order-payments/sds/";

function quote(row) {
  const created = new Date(row.created_at).getTime();
  const version = createHash("sha256").update(JSON.stringify([row.id,row.rail_id,row.offer,row.amount_cents,row.currency,
    row.live_mode,row.checkout_details.findingId,row.checkout_details.email,created])).digest("hex");
  return { id:row.rail_id,resource:base+row.rail_id,cents:row.amount_cents,created,expires:created+7200000,
    version,state:"waiting",...row.rail_state };
}

export function hostedOrderRail(txn,table) {
  const orders = table("hosted_orders");
  const event = (db,row,type) => recordRailEvent(db,table,{...row,journey_session:row.order_key},type);
  async function start({order,findingId,email:requestedEmail,method,stripe,origin,live}) {
    const email = typeof requestedEmail === "string" ? requestedEmail.trim().toLowerCase() : "";
    if (!isOrderId(order) || !isValidSellerRepairFindingId(findingId) || !["stripe","usdc"].includes(method) ||
        (method === "usdc" && (email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))) {
      throw new CareError(400,"Choose a finding and enter your receipt email.");
    }
    const offer = getOffer(SELLER_CONTRACT_REPAIR_SLUG);
    const row = await txn(async db=>{
      await db.query(`insert into ${orders}(id,offer,label,amount_cents,currency,live_mode,state,checkout_rail,order_key,rail_id,checkout_details)
        values($1,$2,$3,$4,'usd',$5,'waiting',$6,$7,$8,$9) on conflict(order_key) do nothing`,
        ["order_"+order,SELLER_CONTRACT_REPAIR_SLUG,offer.label,offer.amount,live,method,order,randomUUID(),{findingId,email}]);
      const saved=(await db.query(`select * from ${orders} where order_key=$1 for update`,[order])).rows[0];
      if (saved.checkout_rail!==method || saved.live_mode!==live || saved.amount_cents!==offer.amount ||
          saved.checkout_details.email!==email || saved.checkout_details.findingId!==findingId) throw conflict();
      if (method==="usdc") await event(db,saved,"checkout_started");
      return saved;
    });
    if (method==="usdc") return {paymentUrl:base+row.rail_id,order:row.id};
    if(row.state!=="waiting" || Date.now()>=new Date(row.created_at).getTime()+7200000) throw conflict();
    const params=buildSellerRepairCheckoutSessionParams(findingId,offer,origin);
    params.metadata.sds_hosted_order=order;
    params.payment_intent_data.metadata.sds_hosted_order=order;
    const session=row.session_id ? await stripe.checkout.sessions.retrieve(row.session_id) :
      await stripe.checkout.sessions.create(params,{idempotencyKey:"sds-hosted/"+order});
    if(!providerId(session,"cs") || session.livemode!==live || session.metadata?.sds_hosted_order!==order || session.amount_total!==offer.amount ||
        session.currency!=="usd" || session.status!=="open" || !session.url) throw conflict();
    const url=new URL(session.url);
    if(url.protocol!=="https:" || url.hostname!=="checkout.stripe.com" || url.username || url.password) throw conflict();
    await txn(async db=>{
      const result=await db.query(`update ${orders} set session_id=$2 where order_key=$1 and checkout_rail='stripe'
        and (session_id is null or session_id=$2) returning id`,[order,session.id]);
      if(!result.rowCount) throw conflict();
    });
    return {url:url.href,order:row.id};
  }
  async function cardPaid(facts) {
    return txn(async db=>{
      const row=(await db.query(`select * from ${orders} where order_key=$1 for update`,[facts.key])).rows[0];
      if(!row || row.checkout_rail!=="stripe" || row.offer!==facts.offer || row.amount_cents!==facts.amount ||
          row.live_mode!==facts.live || row.checkout_details.findingId!==facts.findingId ||
          (row.session_id && row.session_id!==facts.session) || (row.payment_intent_id && row.payment_intent_id!==facts.payment)) throw conflict();
      if (row.state!=="waiting") return {ok:true,isNew:false,orderId:row.id};
      await db.query(`update ${orders} set state='received',session_id=$2,payment_intent_id=$3 where id=$1`,[row.id,facts.session,facts.payment]);
      return {ok:true,isNew:true,orderId:row.id};
    });
  }
  async function change(id,action,body) {
    return txn(async db=>{
      const row=(await db.query(`select * from ${orders} where rail_id=$1 and checkout_rail='usdc' for update`,[id])).rows[0];
      if(!row) throw new CareError(404,"Order not found.");
      const q=quote(row),plan=projectRailChange(q,action,body);
      if(!plan.patch) return plan.value;
      const next={...row.rail_state,...plan.patch};
      const state=({paid:"received",held:"review",refund_pending:"review",refunded:"refunded"})[plan.patch.state] ?? row.state;
      await db.query(`update ${orders} set state=$2,rail_state=$3,refunded_cents=case when $2='refunded' then $4 else refunded_cents end where id=$1`,
        [row.id,state,next,state==="refunded" ? String(BigInt(next.receipt.amount)/10000n) : 0]);
      if(plan.patch.state==="paid") {
        await event(db,row,"payment_verified");
        await queueOrderReceipt(db,table,{hostedId:row.id,email:row.checkout_details.email,label:row.label,
          cents:row.amount_cents,paymentUrl:q.resource,live:row.live_mode,session:row.order_key});
      }
      if(plan.patch.state==="refunded") await event(db,row,"payment_refunded");
      return plan.value ?? {...q,...next};
    });
  }
  return {start,change,cardPaid};
}
