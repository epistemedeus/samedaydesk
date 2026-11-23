import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { openCareStore } from "../lib/care-store.js";
import { careTable, careSchema } from "../lib/care-database.js";
import { legacyOffer, legacyLicense, parseLegacyLicense, withHostedAttribution, hostedOfferRoutes } from "../lib/legacy-order.js";
import { drainCareMail } from "../lib/care-mail.js";
import { hostedLinks } from "../lib/hosted-offer-catalog.js";

test("seven one-time catalog offers retain exact delivered work, receipt and price on the original hosted row",async t=>{
  assert.equal(process.env.SDS_PRIVATE_PREVIEW,"1");
  const pool=new pg.Pool({connectionString:process.env.SDS_CARE_DATABASE_URL}),store=openCareStore();
  t.after(async()=>{await store.close();await pool.end();});
  const table=name=>careTable(name,careSchema()), ids=Object.keys(hostedLinks).filter(id=>legacyOffer(id));
  assert.deepEqual(Object.values(hostedOfferRoutes).sort(),ids.slice().sort());
  assert.equal(withHostedAttribution("https://buy.stripe.com/test_link",{utm_campaign:"clinic",client_reference_id:"other"}),"https://buy.stripe.com/test_link?utm_campaign=clinic");
  assert.equal(ids.length,7);assert.equal(legacyOffer("legacy_skill_watch"),null);
  const links=Object.fromEntries(ids.map(id=>[id,"test_"+id]));
  const env={SDS_PRIVATE_PREVIEW:"1",SDS_ORDER_USDC:"1",SDS_LEGACY_USDC_OFFERS:ids.join(","),SDS_TEST_LEGACY_LINKS:JSON.stringify(links)};
  const stripe={paymentLinks:{list:async()=>({has_more:false,data:ids.map(id=>({id:"plink_"+id,active:true,livemode:false,
    url:"https://buy.stripe.com/"+links[id],custom_fields:[],after_completion:{type:"hosted_confirmation"}}))}),
    listLineItems:async value=>{const id=value.slice(6);return {has_more:false,data:[{quantity:1,price:{id:"price_"+id,
      currency:"usd",active:true,unit_amount:legacyOffer(id).cents,product:{id:"prod_"+id,active:true,name:legacyOffer(id).title}}}]};}}};
  const config={stripe,env,live:false},secret="fixture receipt purpose ".repeat(3);
  const payer="0x"+"2".repeat(40),recipient="0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";
  const asset="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  let serial=0;
  for(const id of ids){
    const offer=legacyOffer(id),input={offer:id,order:randomUUID(),method:"base_usdc",email:"legacy@example.test",target:"https://example.com/work",city:"Palo Alto"};
    const [r,dup]=await Promise.all([store.legacyOrders.start(input,config),store.legacyOrders.start(input,config)]);
    assert.deepEqual(r,dup);
    assert.equal((await store.legacyOrders.status(offer.id,input.order,false)).canOrderAgain,false);
    assert.deepEqual(await store.legacyOrders.start(input,{...config,stripe:{}}),r);
    await assert.rejects(store.legacyOrders.start({...input,method:"card"},config),/already attached/);
    const rid=r.paymentUrl.split("/").at(-1),call=(op,body={})=>store.hostedRail.change(rid,op,body),q=await call("load");
    assert.equal(q.cents,offer.cents);
    const cap=parseLegacyLicense(legacyLicense(secret,rid));
    assert.equal(await store.legacyOrders.entitlement(cap.id,cap.proof,secret),null);
    await call("anchor",{block:"100"});
    const attempt={payer,nonce:"0x"+(++serial).toString(16).padStart(64,"0"),version:q.version,protocol:"x402",nextBlock:"100"};
    await call("arm",{attempt});
    const evidence={payer,recipient,asset,nonce:attempt.nonce,transaction:attempt.nonce,blockHash:"0x"+"b".repeat(64),block:"101",
      timestamp:String(Math.floor(Date.now()/1000)),amount:String(BigInt(offer.cents)*10000n),logIndex:1,transferLogIndex:2};
    const result={state:"paid",evidence};
    const states=await Promise.all([call("observe",{attempt,result}),call("observe",{attempt,result})]);
    assert.ok(states.every(s=>s.state==="paid"));
    assert.equal((await store.legacyOrders.status(offer.id,input.order,false)).canOrderAgain,true);
    const work=(await pool.query(`select * from ${table("task_requests")} where id=$1`,[rid])).rows;
    if (!offer.artifact) {assert.equal(work.length,1);assert.equal(work[0].status,"paid");assert.match(work[0].task,new RegExp(offer.title));}
    else {assert.equal(work.length,0);assert.equal((await store.legacyOrders.entitlement(cap.id,cap.proof,secret)).kind,offer.artifact);}
    assert.equal(await store.legacyOrders.entitlement(cap.id,"a".repeat(43),secret),null);
    const mail=(await pool.query(`select * from ${table("care_mail")} where hosted_order_id=$1`,[r.order])).rows;
    assert.equal(mail.length,1);
    const sent=[];let claimed=false;
    await drainCareMail({store:{nextMail:async()=>claimed?null:(claimed=true,mail[0]),acceptMail:async()=>{}},secret,
      from:"receipt@example.test",replyTo:"support@example.test",send:async message=>{sent.push(message);return {data:{id:"fixture"}};}});
    assert.equal(sent.length,1);
    if(offer.artifact==="kit") assert.deepEqual(Buffer.from(sent[0].attachments[0].content,"base64"),await readFile(new URL("../../client/public/kit/ai-readiness-kit.html",import.meta.url)));
    if(offer.artifact==="fixpack") assert.ok(sent[0].text.includes(legacyLicense(secret,rid)));
  }
  const order=randomUUID(),sale=await store.legacyOrders.start({offer:"legacy_readiness_kit",order,method:"card"},config);
  assert.equal(new URL(sale.url).searchParams.get("client_reference_id"),"sds_legacy_"+order);
  const session={id:"cs_fixture_legacy",payment_link:"plink_legacy_readiness_kit",amount_total:900,client_reference_id:"sds_legacy_"+order};
  await assert.rejects(store.legacyOrders.card({...session,payment_link:"plink_other"},{id:"pi_legacy"},false));
  assert.equal((await store.legacyOrders.card(session,{id:"pi_legacy"},false)).isNew,true);
  assert.equal((await store.legacyOrders.card(session,{id:"pi_legacy"},false)).isNew,false);
  const other={...session,id:"cs_fixture_another"};
  const parallel=await Promise.all([store.legacyOrders.card(other,{id:"pi_extra"},false),store.legacyOrders.card(other,{id:"pi_extra"},false)]);
  assert.ok(parallel.every(x=>x.held && !x.isNew));assert.equal(await store.hostedRefund("pi_extra",900,true),true);
  const saved=(await pool.query(`select * from ${table("hosted_orders")} where id=$1`,[sale.order])).rows[0];
  assert.equal(saved.state,"received");assert.equal(saved.refunded_cents,0);
  assert.deepEqual(saved.checkout_details.duplicateCards.pi_extra,{session:other.id,amount:900,state:"refunded",refundedCents:900});
});
