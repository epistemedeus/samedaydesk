import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { openCareStore } from "../lib/care-store.js";
import { careTable } from "../lib/care-database.js";
import { careMailMessage } from "../lib/care-mail.js";
import { receivePublishedRelease } from "./skill-watch-release.mjs";

test("Watch preserves one twelve-dollar paid period, explicit renewal, catalog link and original release alerts",async t=>{
  assert.equal(process.env.SDS_PRIVATE_PREVIEW,"1");
  const pool=new pg.Pool({connectionString:process.env.SDS_CARE_DATABASE_URL}),store=openCareStore();
  t.after(async()=>{await store.close();await pool.end();});
  const origin="https://samedaydesk.com",repository="https://github.com/example/watch-fixture",order=randomUUID();
  const env={SDS_ORDER_USDC:"1",SDS_SKILL_WATCH_USDC:"1",SDS_PRIVATE_PREVIEW:"1",SDS_TEST_LEGACY_LINKS:'{"legacy_skill_watch":"test_watch"}'};
  const stripe={paymentLinks:{list:async()=>({has_more:false,data:[{active:true,livemode:false,id:"plink_watch",url:"https://buy.stripe.com/test_watch"}]}),
    listLineItems:async()=>({has_more:false,data:[{quantity:1,price:{id:"price_watch",active:true,unit_amount:1200,currency:"usd",product:{active:true,id:"prod_watch"},
      recurring:{interval:"month",interval_count:1}}}]})}};
  const cfg={stripe,env,live:false,origin},input={order,method:"base_usdc",repositories:repository,email:"owner@example.test"};
  const [a,b]=await Promise.all([store.watch.start(input,cfg),store.watch.start(input,cfg)]);
  assert.deepEqual(a,b);await assert.rejects(store.watch.start({...input,method:"card"},cfg));
  assert.deepEqual(await store.watch.start(input,{...cfg,stripe:{}}),a);
  const id=a.paymentUrl.split("/").at(-1),change=(op,body={})=>store.usdc.change(id,op,body);
  const q=await change("load");assert.equal(q.cents,1200);
  const payer="0x"+"2".repeat(40),nonce="0x"+"a".repeat(64),stamp=Math.floor(Date.now()/1000);
  const attempt={payer,nonce,nextBlock:"1",version:q.version,protocol:"x402"};
  const result={state:"paid",evidence:{payer,nonce,recipient:"0x8904df3de6dfee6a7c8cc38619d2f17806213cee",
    amount:"12000000",asset:"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",transaction:nonce,blockHash:nonce,block:"2",
    timestamp:String(stamp),logIndex:0,transferLogIndex:1}};
  await change("anchor",{block:"1"});assert.equal((await change("arm",{attempt})).armed,true);
  await Promise.all([change("observe",{attempt,result}),change("observe",{attempt,result})]);
  const parent=await store.order(order);
  const list=async(name,where,args)=> (await pool.query("select * from "+careTable(name)+" where "+where,args)).rows;
  const periods=await list("care_periods","order_id=$1",[order]);assert.equal(periods.length,1);
  const invoices=await list("care_orders","rail_parent=$1",[order]);assert.equal(invoices.length,1);
  assert.equal(invoices[0].rail_attempt,null);assert.equal(invoices[0].amount_cents,1200);assert.equal(invoices[0].offer,parent.offer);
  const mail=await list("care_mail","order_id=$1",[order]);assert.equal(mail.length,2);
  const render=item=>careMailMessage({order:parent,item,secret:"test secret ".repeat(4),from:"from@example.test",replyTo:"rep@example.test"});
  assert.ok(render(mail.find(x=>x.kind==="receipt")).text.includes(repository));
  assert.match(render(mail.find(x=>x.kind==="monthly_invoice")).text,/Pay 12 USDC/);
  const release={repository,commit:"b".repeat(40),publishedAt:new Date(stamp*1000).toISOString(),report:{verdict:"suspicious",scanned:3,rules:["warn example"]}};
  const competing=await Promise.all([store.watch.observeRelease(release),store.watch.observeRelease(release)]);
  assert.equal(competing.reduce((n,r)=>n+r.alertsQueued,0),1);
  assert.deepEqual(await store.watch.observeRelease({...release,repository:"https://github.com/elsewhere/different"}),{observed:0,alertsQueued:0});
  assert.deepEqual(await store.watch.observeRelease({...release,commit:"e".repeat(40)}),{observed:1,alertsQueued:0});
  const alert=(await list("care_mail","order_id=$1 and kind='skill_watch_alert'",[order]))[0];
  assert.match(render(alert).text,/warn example/);
  if(process.env.SKILLGUARD_SOURCE) {
    const checkout=await mkdtemp(join(tmpdir(),"sds-owned-watch-fixture-"));t.after(()=>rm(checkout,{recursive:true,force:true}));
    const git=args=>execFileSync("git",["-C",checkout,...args],{stdio:["ignore","pipe","pipe"]}).toString().trim();
    git(["init","-q"]);git(["remote","add","origin",repository]);await writeFile(join(checkout,"README.md"),"An ordinary local documentation fixture.\n");
    git(["add","README.md"]);git(["-c","user.name=fixture","-c","user.email=fixture@example.test","commit","-qm","Fixture release"]);git(["tag","v1"]);
    const commit=git(["rev-parse","HEAD"]),run=(sha=commit)=>receivePublishedRelease({repository,tag:"v1",checkout,scanner:process.env.SKILLGUARD_SOURCE,store,
      read:async url=>url.includes("/releases/")?{tag_name:"v1",draft:false,published_at:release.publishedAt}:{sha}});
    assert.deepEqual(await run(),{observed:1,alertsQueued:0});assert.deepEqual(await run(),{observed:0,alertsQueued:0});
    await assert.rejects(run("c".repeat(40)),/local and upstream/);
  }
  // Cancellation during an admitted future payment retains the incoming debit for refund.
  const child=invoices[0],now=new Date();
  await pool.query("update "+careTable("care_orders")+" set rail_period_start=$2 where id=$1",[child.id,now]);
  const cc=(op,body={})=>store.usdc.change(child.rail_id,op,body),cq=await cc("load");
  const next={...attempt,nonce:"0x"+"d".repeat(64),version:cq.version};
  await cc("anchor",{block:"1"});assert.equal((await cc("arm",{attempt:next})).armed,true);
  await store.subscriptionState(parent.id,{status:"active",cancel:true,at:new Date()});
  const held=await cc("observe",{attempt:next,result:{state:"paid",evidence:{...result.evidence,nonce:next.nonce,transaction:next.nonce}}});
  assert.equal(held.state,"held");assert.equal(held.reason,"subscription_under_review");
  assert.equal((await list("care_periods","order_id=$1",[order])).length,1);
  const card=await store.watch.start({order:randomUUID(),method:"card"},cfg);assert.match(card.url,/buy.stripe.com\/test_watch\?client_reference_id=sds_watch_/);
  const cardId=card.order,email="card@example.test",session={id:"cs_watch",subscription:"sub_watch",customer:"cus_watch",invoice:"in_watch",
    client_reference_id:"sds_watch_"+cardId,livemode:false,status:"complete",payment_status:"paid",mode:"subscription",currency:"usd",
    amount_total:1200,payment_link:"plink_watch",customer_details:{email},custom_fields:[{type:"text",text:{value:repository}}]};
  const stripeCard={subscriptions:{retrieve:async()=>({id:"sub_watch",customer:"cus_watch",livemode:false,latest_invoice:"in_watch",items:{has_more:false,
    data:[{quantity:1,price:{id:"price_watch",unit_amount:1200,currency:"usd",recurring:{interval:"month",interval_count:1}}}]}})},
    invoices:{retrieve:async()=>({id:"in_watch",parent:{subscription_details:{subscription:"sub_watch"}},customer:"cus_watch",livemode:false,
      status:"paid",currency:"usd",amount_paid:1200,billing_reason:"subscription_create",lines:{has_more:false,data:[{amount:1200,period:{start:stamp,end:stamp+30*86400}}]}})}};
  await Promise.all([store.watch.card(session,stripeCard,false,store),store.watch.card(session,stripeCard,false,store)]);
  assert.equal((await list("care_periods","order_id=$1",[cardId])).length,1);
  assert.equal((await list("care_mail","order_id=$1 and kind='receipt'",[cardId])).length,1);
  assert.deepEqual((await store.order(cardId)).intake.repositories,[repository]);
  await assert.rejects(store.watch.start({...input,order:cardId},cfg));
  const newRisk={...release,commit:"c".repeat(40),report:{...release.report,rules:["warn newly observed"]}};
  assert.equal((await store.watch.observeRelease(newRisk)).alertsQueued,2);

});
