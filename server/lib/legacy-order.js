import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { CareError, isOrderId, careToken, verifyCareToken } from "./care-contract.js";
import { hostedLinks, readHostedTerms } from "./hosted-offer-catalog.js";
import { recordRailEvent } from "./care-usdc.js";

let offers;
const definition = Object.freeze({
  legacy_skill_audit: { title: "SkillGuard Deep Audit", target: "Repository to review" },
  legacy_visibility_audit: { title: "AI Visibility Audit" },
  legacy_visibility_fix: { title: "AI Visibility Audit and Fix" },
  legacy_visibility_sprint: { title: "AI Visibility Sprint" },
  legacy_med_spa_bundle: { title: "SchemaForge Clinic Bundle", target: "Website", city: true },
  legacy_readiness_kit: { title: "AI Search Readiness Kit", artifact: "kit" },
  legacy_fix_pack: { title: "AI Readiness Fix Pack", target: "Website", artifact: "fixpack" },
});
const reject = () => new CareError(409,"Check the payment already attached to this order.");
export function legacyOffer(id) {
  if (!Object.hasOwn(definition,id)) return null;
  offers ??= JSON.parse(readFileSync(new URL("../../release/offers.json",import.meta.url))).notInHarnessYet;
  const offer = offers.find(row=>row.id===id);
  if (!offer || offer.interval) return null;
  return { id:offer.id, cents:offer.cents, ...definition[id] };
}
export const hostedOfferRoutes=Object.freeze({
  "skillguard-deep-audit":"legacy_skill_audit","ai-visibility-audit":"legacy_visibility_audit",
  "ai-visibility-audit-and-fix":"legacy_visibility_fix","ai-visibility-sprint":"legacy_visibility_sprint",
  "schemaforge-clinic-bundle":"legacy_med_spa_bundle","ai-search-readiness-kit":"legacy_readiness_kit",
  "ai-readiness-fix-pack":"legacy_fix_pack",
});
export function withHostedAttribution(destination,query) {
  const url=new URL(destination);
  for(const key of ["utm_source","utm_medium","utm_campaign","utm_term","utm_content"]) {
    const value=query[key];
    if(typeof value==="string" && /^[a-zA-Z0-9_.+ -]{1,100}$/.test(value))url.searchParams.set(key,value);
  }
  return url.href;
}
export function legacyEnabled(id,env) {
  return !!legacyOffer(id) && env.SDS_ORDER_USDC === "1" && (env.SDS_LEGACY_USDC_OFFERS || "").split(",").includes(id);
}
export function legacySlug(id,env) {
  if (!Object.hasOwn(hostedLinks,id)) throw reject();
  const preview=env.SDS_PRIVATE_PREVIEW==="1";
  const slug=preview ? JSON.parse(env.SDS_TEST_LEGACY_LINKS || "{}")[id] : hostedLinks[id];
  if (typeof slug !== "string" || !/^[A-Za-z0-9_]+$/.test(slug) || slug.startsWith("test_")!==preview) throw reject();
  return slug;
}
function details(offer,input) {
  const email=String(input.email || "").trim().toLowerCase();
  if (email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CareError(400,"Enter your receipt email.");
  let target=null;
  if (offer.target) {
    try {
      const url=new URL(input.target);
      if (!["https:","http:"].includes(url.protocol) || url.username || url.password || url.hash ||
          !url.hostname.includes(".") || url.href.length>300) throw Error();
      target=url.href;
    } catch { throw new CareError(400,"Enter the public website or repository."); }
  }
  const city=offer.city ? String(input.city || "").trim() : "";
  if(city.length>120 || /[\x00-\x1f]/.test(city)) throw new CareError(400,"Enter a shorter city name.");
  return {email,target,city};
}

export function legacyOrders(txn,table) {
  const name=table("hosted_orders");
  async function start(input,{stripe,env,live}) {
    const offer=legacyOffer(input.offer);
    if (!offer || !legacyEnabled(offer.id,env)) throw new CareError(404,"Payment method unavailable.");
    if (!isOrderId(input.order) || !["card","base_usdc"].includes(input.method)) throw new CareError(400,"Choose a payment method.");
    const rail=input.method==="card"?"stripe":"usdc";
    const data=rail==="usdc"?details(offer,input):{email:null,target:null,city:""};
    const slug=legacySlug(offer.id,env);
    function checkSaved(row) {
      if (!row || row.checkout_rail!==rail || row.offer!==offer.id || row.live_mode!==live ||
          !row.checkout_details.linkId || !row.checkout_details.priceId ||
          Object.keys(data).some(k=>row.checkout_details[k]!==data[k])) throw reject();
      return row;
    }
    function result(row) {
      if(rail==="usdc") return {order:row.id,paymentUrl:"https://agents.samedaydesk.com/order-payments/sds/"+row.rail_id};
      if(row.state!=="waiting")throw reject();
      const url=new URL("https://buy.stripe.com/"+slug);url.searchParams.set("client_reference_id","sds_legacy_"+row.order_key);
      return {order:row.id,url:url.href};
    }
    const lookup=(db,lock="")=>db.query(`select * from ${name} where order_key=$1 ${lock}`,[input.order]);
    const existing=await txn(async db=>(await lookup(db)).rows[0]);
    if(existing)return result(checkSaved(existing));
    // Only a new order asks Stripe for a quote. Recovery uses the original elected terms.
    const terms=(await readHostedTerms(stripe,[offer],{links:{[offer.id]:slug},live})).items[offer.id];
    if (!terms?.active || terms.interval!==null || terms.cents!==offer.cents) throw reject();
    const row=await txn(async db=>{
      await db.query(`insert into ${name}(id,offer,label,amount_cents,currency,live_mode,state,checkout_rail,order_key,rail_id,checkout_details)
        values($1,$2,$3,$4,'usd',$5,'waiting',$6,$7,$8,$9) on conflict do nothing`,
        ["order_"+input.order,offer.id,offer.title,offer.cents,live,rail,input.order,randomUUID(),{...data,linkId:terms.linkId,priceId:terms.priceId}]);
      const saved=checkSaved((await lookup(db,"for update")).rows[0]);
      if(rail==="usdc") await recordRailEvent(db,table,{...saved,journey_session:saved.order_key},"checkout_started");
      return saved;
    });
    return result(row);
  }
  async function card(session,intent,live) {
    const key=String(session.client_reference_id || "").replace(/^sds_legacy_/,"");
    if (!isOrderId(key)) throw reject();
    return txn(async db=>{
      const row=(await db.query(`select * from ${name} where order_key=$1 for update`,[key])).rows[0];
      if (!row || !legacyOffer(row.offer) || row.live_mode!==live || session.payment_link!==row.checkout_details.linkId) throw reject();
      if(row.checkout_rail!=="stripe" || session.amount_total!==row.amount_cents ||
          (row.session_id && row.session_id!==session.id) || (row.payment_intent_id && row.payment_intent_id!==intent.id)) {
        // A public hosted link may produce another Stripe session. Keep each actual debit and its
        // own refund on this order. Never change the elected delivery or fill a second order.
        const duplicates=row.checkout_details.duplicateCards ?? {};
        const prior=duplicates[intent.id];
        if(prior && (prior.session!==session.id || prior.amount!==session.amount_total))throw reject();
        if(!prior) {
          duplicates[intent.id]={session:session.id,amount:session.amount_total,state:"review",refundedCents:0};
          await db.query(`update ${name} set checkout_details=jsonb_set(checkout_details,'{duplicateCards}',$2::jsonb) where id=$1`,
            [row.id,JSON.stringify(duplicates)]);
        }
        return {ok:true,isNew:false,held:true,orderId:row.id};
      }
      if(row.state!=="waiting") return {ok:true,isNew:false,orderId:row.id};
      await db.query(`update ${name} set state='received',session_id=$2,payment_intent_id=$3 where id=$1`,[row.id,session.id,intent.id]);
      return {ok:true,isNew:true,orderId:row.id};
    });
  }
  async function entitlement(id,proof,secret) {
    if (!verifyCareToken(secret,id,"legacy-delivery",proof)) return null;
    return txn(async db=>{
      const row=(await db.query(`select * from ${name} where rail_id=$1 and checkout_rail='usdc' and state='received'`,[id])).rows[0];
      const offer=row && legacyOffer(row.offer), receipt=row?.rail_state?.receipt;
      if(!offer?.artifact || row.rail_state.state!=="paid" || !receipt || receipt.amount!==String(BigInt(offer.cents)*10000n)) return null;
      return {kind:offer.artifact,target:row.checkout_details.target,label:offer.title};
    });
  }
  return { start, card, entitlement };
}

export function legacyLicense(secret,id) { return "sds_"+id+"_"+careToken(secret,id,"legacy-delivery"); }
export function parseLegacyLicense(value) {
  const match=/^sds_([a-f0-9-]{36})_([a-zA-Z0-9_-]{43})$/.exec(value || "");
  return match && {id:match[1],proof:match[2]};
}

// Paid human work enters the existing operator task list. Instant products are
// delivered by the existing kit and complete-pack sources.
export async function legacyFulfillment(db,table,row,phase) {
  const offer=legacyOffer(row.offer);
  if (!offer || offer.artifact) return;
  if (phase==="refunded") {
    await db.query(`update ${table("task_requests")} set status='closed' where id=$1 and status='paid'`,[row.rail_id]);
    return;
  }
  const {email,target,city}=row.checkout_details;
  await db.query(`insert into ${table("task_requests")}(id,email,website,task,status) values($1,$2,$3,$4,'paid')`,
    [row.rail_id,email,target,[offer.title,"Order "+row.id,target,city].filter(Boolean).join("\n")]);
}
