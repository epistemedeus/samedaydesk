import { createHash, randomUUID } from "node:crypto";
import { CareError, carePaidPeriod, isOrderId, newIntegrationId, watchOffer } from "./care-contract.js";
import { legacySlug } from "./legacy-order.js";
import { readHostedTerms } from "./hosted-offer-catalog.js";
import { recordRailEvent } from "./care-usdc.js";
import { isOfficialPage, officialDigest, officialWatch } from "./watch-official-pages.js";

export { watchOffer };
export function watchEnabled(env) {
  return env.SDS_ORDER_USDC==="1" && env.SDS_SKILL_WATCH_USDC==="1";
}
const conflict=()=>new CareError(409,"Check the payment already attached to this subscription.");
// Aliases match the Care store's order/period join. Only the reserved
// owner-enrolled record can produce or release official-page mail.
export const officialWatchEnrollment = (at) => `
  o.id='${officialWatch.order}' and p.invoice_id='${officialWatch.window}'
  and o.offer='legacy_skill_watch' and o.integration_id='${officialWatch.tag}'
  and o.state='review' and not o.live_mode and o.rail_email='${officialWatch.recipient}'
  and p.status='review' and p.period_start<=${at} and p.period_end>${at}
  and jsonb_typeof(o.intake->'officialPages')='array'`;
function repositories(raw) {
  const values=String(raw||"").split(/[\s,]+/).filter(Boolean);
  const safe=values.map(value=>{
    try {
      const url=new URL(value);if(url.protocol!=="https:" || url.port || url.username || url.password || url.search || url.hash ||
        !url.hostname.includes(".") || url.pathname==="/" || url.href.length>300)throw Error();
      return url.href.replace(/(?:\.git)?\/?$/,"");
    } catch {throw new CareError(400,"Enter the HTTPS repository links you want watched.");}
  });
  if(!safe.length || safe.join("\n").length>3500)throw new CareError(400,"Enter the repositories you want watched.");
  return [...new Set(safe)].sort();
}
export function skillWatchStore(txn,table) {
  const orders=table("care_orders"),periods=table("care_periods");
  const releaseKey=(repository,commit)=>createHash("sha256").update(JSON.stringify([repository,commit])).digest("hex");
  const ready=`o.offer=$1 and o.state='paid' and p.status='ready'`;
  async function start(input,{stripe,live,env,origin}) {
    if(!watchEnabled(env) || !isOrderId(input.order) || !["card","base_usdc"].includes(input.method))throw conflict();
    const usdc=input.method==="base_usdc",rail=usdc?"usdc":"stripe";
    const email=usdc?String(input.email||"").trim().toLowerCase():null;
    if(usdc && (email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw new CareError(400,"Enter your receipt email.");
    const repos=usdc?repositories(input.repositories):null,slug=legacySlug(watchOffer.id,env);
    function read(saved) {
      if(!saved || saved.offer!==watchOffer.id || saved.checkout_rail!==rail || saved.rail_email!==email ||
        saved.live_mode!==live || saved.checkout_origin!==origin || JSON.stringify(saved.intake.repositories)!==JSON.stringify(repos))throw conflict();
      if(usdc)return {order:saved.id,paymentUrl:"https://agents.samedaydesk.com/order-payments/sds/"+saved.rail_id};
      if(saved.state!=="created")throw conflict();
      const url=new URL("https://buy.stripe.com/"+slug);url.searchParams.set("client_reference_id","sds_watch_"+saved.id);
      return {order:saved.id,url:url.href};
    }
    const lookup=(db,lock="")=>db.query(`select * from ${orders} where id=$1 ${lock}`,[input.order]);
    const existing=await txn(async db=>(await lookup(db)).rows[0]);
    if(existing)return read(existing);
    const terms=(await readHostedTerms(stripe,[watchOffer],{links:{[watchOffer.id]:slug},live})).items[watchOffer.id];
    if(!terms?.active || terms.interval!=="month" || terms.cents!==watchOffer.cents)throw conflict();
    return txn(async db=>{
      await db.query(`insert into ${orders}(id,offer,amount_cents,live_mode,checkout_expires_at,checkout_origin,integration_id,
        journey_session,checkout_rail,rail_id,rail_email,intake) values($1,$2,$3,$4,now()+interval '2 hours',$5,$6,$1,$7,$8,$9,$10)
        on conflict(id) do nothing`,[input.order,watchOffer.id,watchOffer.cents,live,origin,newIntegrationId(),rail,usdc?randomUUID():null,email,
        {repositories:repos,linkId:terms.linkId,priceId:terms.priceId}]);
      const saved=(await lookup(db,"for update")).rows[0],response=read(saved);
      if(usdc)await recordRailEvent(db,table,saved,"checkout_started");
      return response;
    });
  }
  async function card(session,stripe,live,store) {
    const id=String(session.client_reference_id).slice("sds_watch_".length);
    if(!isOrderId(id) || session.livemode!==live || session.mode!=="subscription" ||
      session.status!=="complete" || session.payment_status!=="paid" || session.currency!=="usd" || session.amount_total!==watchOffer.cents ||
      !/^cs_[a-zA-Z0-9_]+$/.test(session.id) || !/^sub_[a-zA-Z0-9_]+$/.test(session.subscription) ||
      !/^cus_[a-zA-Z0-9_]+$/.test(session.customer))throw conflict();
    const email=String(session.customer_details?.email || "").trim().toLowerCase();
    if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw conflict();
    const subscription=await stripe.subscriptions.retrieve(session.subscription);
    const price=subscription.items?.data?.[0]?.price;
    if(subscription.id!==session.subscription || subscription.customer!==session.customer || subscription.livemode!==live ||
      subscription.items?.has_more || subscription.items?.data?.length!==1 || subscription.items.data[0].quantity!==1 ||
      price?.unit_amount!==watchOffer.cents || price?.currency!=="usd" || price?.recurring?.interval!=="month" ||
      price.recurring.interval_count!==1)throw conflict();
    // Stripe collects the original link's repository field. An unmatched free-text
    // intake stays on the operator's original order for follow-up.
    const raw=(session.custom_fields||[]).filter(x=>x.type==="text" && x.text?.value).map(x=>x.text.value).join("\n");
    let repos;
    try {repos=repositories(raw);} catch {repos=[];}
    const row=await txn(async db=>{
      const o=(await db.query(`select * from ${orders} where id=$1 for update`,[id])).rows[0];
      if(!o || o.offer!==watchOffer.id || o.live_mode!==live || o.intake.linkId!==session.payment_link || o.intake.priceId!==price.id)throw conflict();
      if(o.checkout_rail!=="stripe" || (o.session_id && o.session_id!==session.id) || (o.subscription_id && o.subscription_id!==session.subscription)) {
        const extra=o.intake.duplicateSubscriptions??{};
        extra[session.subscription]={session:session.id,state:"review"};
        await db.query(`update ${orders} set intake=jsonb_set(intake,'{duplicateSubscriptions}',$2::jsonb) where id=$1`,[id,JSON.stringify(extra)]);
        return null;
      }
      await db.query(`update ${orders} set session_id=$2,subscription_id=$3,customer_id=$4,
        intake=intake || $5::jsonb where id=$1`,[id,session.id,session.subscription,session.customer,JSON.stringify({repositories:repos,originalRequest:raw})]);
      return o;
    });
    if(!row)return;
    const paid=await store.checkoutPaid({id,sessionId:session.id,customerId:session.customer,paymentId:null,subscriptionId:session.subscription,email,at:new Date()});
    const invoiceId=session.invoice || subscription.latest_invoice;
    const invoice=await stripe.invoices.retrieve(invoiceId);
    const period=carePaidPeriod(invoice,paid);
    if(!period || invoice.id!==invoiceId)throw conflict();
    await store.paidPeriod(id,invoice.id,period);
  }
  // A release is matched against the paid interval in which it was published.
  // The same original repository/release can emit at most one warning per order.
  async function observeRelease({repository,commit,publishedAt,report}) {
    const [repo]=repositories(repository),at=new Date(publishedAt);
    if(repo!==repository || !/^[a-f0-9]{40}$/.test(commit) || !Number.isFinite(at.getTime()) || at>Date.now() ||
        !["clean","suspicious","dangerous"].includes(report?.verdict) || !Number.isSafeInteger(report.scanned) || report.scanned<1 ||
        !Array.isArray(report.rules) || report.rules.some(rule=>typeof rule!=="string" || rule.length>150))throw conflict();
    const key=releaseKey(repo,commit);
    return txn(async db=>{
      const {rows}=await db.query(`select p.invoice_id,p.order_id,p.report,o.rail_email from ${periods} p join ${orders} o on o.id=p.order_id
        where ${ready} and o.intake->'repositories' ? $2
          and p.period_start<=$3 and p.period_end>$3 for update of p,o`,[watchOffer.id,repo,at]);
      let fresh=0,alerted=0;
      for(const row of rows) {
        if(row.report?.releases?.[key])continue;
        const releases={...row.report?.releases,[key]:{repository:repo,commit,publishedAt:at.toISOString(),...report}};
        await db.query(`update ${periods} set report=jsonb_set(coalesce(report,'{}'::jsonb),'{releases}',$2)
          where invoice_id=$1`,[row.invoice_id,releases]);fresh++;
        if(report.verdict==="clean")continue;
        const prior=await db.query(`select entry.value->'rules' as rules from ${periods} p
          cross join lateral jsonb_each(coalesce(p.report->'releases','{}'::jsonb)) entry
          where p.order_id=$1 and entry.key<>$2 and entry.value->>'repository'=$3 and (entry.value->>'publishedAt')::timestamptz<=$4
          order by (entry.value->>'publishedAt')::timestamptz desc,entry.key limit 1`,[row.order_id,key,repo,at]);
        const known=new Set(prior.rows[0]?.rules||[]), newRules=report.rules.filter(rule=>!known.has(rule));
        if(!newRules.length)continue;
        const mail=await db.query(`insert into ${table("care_mail")}(mail_key,order_id,kind,details)
          values($1,$2,'skill_watch_alert',$3) on conflict do nothing`,["watch/"+row.order_id+"/"+key,row.order_id,
          {invoiceId:row.invoice_id,repository:repo,commit,verdict:report.verdict,rules:newRules}]);alerted+=mail.rowCount;
      }
      return {observed:fresh,alertsQueued:alerted};
    });
  }
  async function openReleaseSchedule(at) {
    // Use the database clock so restarts and simultaneous ticks share one
    // ordering. A tick cannot reselect anything claimed after it opened.
    const started=await txn(async db=>(await db.query("select clock_timestamp()::text as started")).rows[0].started);
    return () => txn(async db=>{
      await db.query("select pg_advisory_xact_lock(hashtextextended($1, 99125))",[`skill-watch:${periods}`]);
      const {rows}=await db.query(`with eligible as (
        select r.repository collate "C" as repository,min(p.period_start) as since,
          min(p.invoice_id collate "C") as invoice_id,max((p.report->'watchSchedule'->>r.repository)::timestamptz) as claimed
        from ${periods} p join ${orders} o on o.id=p.order_id cross join lateral jsonb_array_elements_text(
          case when jsonb_typeof(o.intake->'repositories')='array' then o.intake->'repositories' else '[]'::jsonb end
        ) r(repository) where ${ready} and p.period_start<=$2 and p.period_end>$2 and r.repository is not null
        group by r.repository collate "C"
      ), next as (
        select repository,since,invoice_id from eligible where claimed is null or claimed<$3::timestamptz
        order by claimed nulls first,since,repository limit 1
      ) update ${periods} p set report=jsonb_set(coalesce(p.report,'{}'::jsonb),'{watchSchedule}',
        coalesce(p.report->'watchSchedule','{}'::jsonb) || jsonb_build_object(next.repository,clock_timestamp()))
      from next where p.invoice_id=next.invoice_id and p.status='ready' returning next.repository,next.since`,[watchOffer.id,at,started]);
      return rows[0] ?? null;
    });
  }
  async function needsRelease({repository,commit,publishedAt}) {
    return txn(async db=>(await db.query(`select exists(select 1 from ${periods} p join ${orders} o on o.id=p.order_id
      where ${ready} and o.intake->'repositories' ? $2 and p.period_start<=$3 and p.period_end>$3
        and not (coalesce(p.report->'releases','{}'::jsonb) ? $4)) as needed`,
    [watchOffer.id,repository,publishedAt,releaseKey(repository,commit)])).rows[0].needed);
  }
  async function officialTargets(at) {
    return txn(async db => {
      const { rows } = await db.query(`select o.intake->'officialPages' as targets
        from ${periods} p join ${orders} o on o.id=p.order_id
        where ${officialWatchEnrollment("$1")}`, [at]);
      return rows[0]?.targets ?? null;
    });
  }

  async function observeOfficialPage({ id, digest, at }) {
    if (!isOfficialPage(id) || typeof digest !== "string" || !officialDigest.test(digest) ||
        !(at instanceof Date) || !Number.isFinite(at.getTime())) throw conflict();
    return txn(async db => {
      const { rows } = await db.query(`select p.invoice_id,p.report from ${periods} p join ${orders} o on o.id=p.order_id
        where ${officialWatchEnrollment("$1")} and o.intake->'officialPages' ? $2 for update of p,o`, [at,id]);
      const row = rows[0];
      if (!row) return "skipped";
      const previous = row.report?.officialPages?.[id];
      const checkedAt = at.toISOString();
      if (previous?.checkedAt >= checkedAt) return "skipped";
      const observations = { ...row.report?.officialPages, [id]: { digest, checkedAt } };
      await db.query(`update ${periods} set report=jsonb_set(coalesce(report,'{}'::jsonb),'{officialPages}',$2)
        where invoice_id=$1`, [row.invoice_id, observations]);
      if (!previous) return "baseline";
      if (previous.digest === digest) return "unchanged";
      const key = createHash("sha256").update(JSON.stringify([id, previous, digest])).digest("hex");
      await db.query(`insert into ${table("care_mail")}(mail_key,order_id,kind,details)
        values($1,$2,'skill_watch_alert',$3) on conflict(mail_key) do nothing`,
      ["watch/official/" + key, officialWatch.order, { source: "official_page", target: id, invoiceId: row.invoice_id }]);
      return "changed";
    });
  }

  return {start,card,observeRelease,openReleaseSchedule,needsRelease,officialTargets,observeOfficialPage};
}
