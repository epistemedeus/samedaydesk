import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { openCareStore, createCareStore } from "../lib/care-store.js";
import { createCareService } from "../lib/care-service.js";
import { careTable } from "../lib/care-database.js";
import { createOwnedOrder } from "./care-usdc-qa.mjs";
import { careMailMessage } from "../lib/care-mail.js";
import { railQuote } from "../lib/care-usdc.js";
import { careLink, verifyCareToken } from "../lib/care-contract.js";

const payer = "0x1111111111111111111111111111111111111111", merchant = "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";
const asset = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const secret = "isolated care access secret sufficient length";
const origin = "http://127.0.0.1:3100";
const email = "owner@example.test";
test("Care PostgreSQL elects a method and fulfils a finalized USDC payment exactly once", async t => {
  assert.equal(process.env.SDS_PRIVATE_PREVIEW, "1");
  const pool = new pg.Pool({ connectionString: process.env.SDS_CARE_DATABASE_URL });
  const store = openCareStore();
  t.after(async () => { await store.close(); await pool.end(); });
  const service = createCareService({ store, stripe: {}, live: false, origin, secret, orderPayments: true });
  const id = randomUUID();
  const results = await Promise.all(Array.from({ length: 5 }, () => service.startUsdc("machine_payment_route", id, email)));
  assert.equal(new Set(results.map(r => r.paymentUrl)).size, 1);
  const row = await store.order(id);
  assert.notEqual(row.id, row.rail_id);
  const wallet = new URL(results[0].wallet), receipt = new URL(careLink(row, secret));
  assert.equal(wallet.origin, "https://agents.samedaydesk.com");
  assert.equal(wallet.pathname, `/order-payments/sds/${row.rail_id}/wallet`);
  assert.equal(wallet.searchParams.get("return"), receipt.pathname + receipt.hash);
  assert.equal(new URLSearchParams(receipt.hash.slice(1)).get("order"), id);
  assert.ok(verifyCareToken(secret, id, "intake", new URLSearchParams(receipt.hash.slice(1)).get("key")));
  assert.equal(results[0].receipt, receipt.href);
  assert.equal(results[0].paymentUrl, `https://agents.samedaydesk.com/order-payments/sds/${row.rail_id}`);
  assert.equal((await service.read(id, new URLSearchParams(receipt.hash.slice(1)).get("key"))).wallet, wallet.href);
  await assert.rejects(service.start("machine_payment_route", id), /different checkout/);
  const action = (key, body = {}) => store.usdc.change(row.rail_id, key, body);
  const q = await action("load");
  assert.equal(q.cents, 49900);
  assert.deepEqual(await action("anchor", { block: "10" }), { block: "10" });
  const attempt = { protocol: "x402", payer, nonce: "0x" + "2".repeat(64), version: q.version, nextBlock: "10" };
  const races = await Promise.all(Array.from({ length: 8 }, () => action("arm", { attempt })));
  assert.equal(races.filter(r => r.armed).length, 1);
  const later = createCareStore(pool, process.env.SDS_CARE_SCHEMA);
  assert.equal((await later.usdc.change(row.rail_id, "load", {})).attempt.nonce, attempt.nonce);
  const e = { asset, recipient: merchant, payer, transaction: "0x" + "3".repeat(64), logIndex: 0, transferLogIndex: 1,
    nonce: attempt.nonce, block: "10", blockHash: "0x" + "4".repeat(64), timestamp: String(Math.ceil(q.created / 1000)), amount: "499000000" };
  await assert.rejects(action("observe", { attempt, result: { state: "paid", evidence: { ...e, payer: merchant } } }));
  const observed = await Promise.all(Array.from({ length: 6 }, () => action("observe", { attempt, result: { state: "paid", evidence: e } })));
  for (const result of observed) assert.equal(result.state, "paid");
  assert.equal((await store.order(id)).state, "paid");
  const mail = await pool.query(`select * from ${careTable("care_mail")} where order_id=$1`, [id]);
  assert.equal(mail.rowCount, 1);
  assert.equal(careMailMessage({ order: await store.order(id), item: mail.rows[0], secret }).to, email);
  assert.equal((await pool.query(`select * from ${careTable("journey_events")} where order_id=$1`, [id])).rowCount, 2);
  for (let i = 0; i < 8; i++) {
    const race = { id: randomUUID(), offer: "agent_front_door", cents: 24900, live: false, origin, expires: new Date(Date.now() + 7200000),
      integrationId: "sameday-care-racetest", journeySession: id };
    const attempts = await Promise.allSettled([store.reserve(race), store.reserve({ ...race, rail: "usdc", railEmail: email })]);
    assert.equal(attempts.filter(x => x.status === "fulfilled").length, 1);
  }
});
test("only private QA creation produces a small quote; marks survive readback", async t => {
  assert.equal(process.env.SDS_PRIVATE_PREVIEW, "1");
  const pool = new pg.Pool({ connectionString: process.env.SDS_CARE_DATABASE_URL });
  t.after(() => pool.end());
  const id = randomUUID(), params = { id, cents: 1, email, live: false, origin };
  const qa = await createOwnedOrder(pool, process.env.SDS_CARE_SCHEMA, params);
  assert.equal(qa.wallet, qa.agent + "/wallet");
  assert.equal(new URL(qa.wallet).search, "");
  assert.deepEqual(qa, await createOwnedOrder(pool, process.env.SDS_CARE_SCHEMA, params));
  await assert.rejects(createOwnedOrder(pool, process.env.SDS_CARE_SCHEMA, { ...params, cents: 2 }));
  const row = (await pool.query(`select * from ${careTable("care_orders")} where id=$1`, [id])).rows[0];
  assert.equal(railQuote(row).cents, 1); assert.equal(row.amount_cents, 49900);
  assert.equal((await pool.query(`select test from ${careTable("journey_events")} where order_id=$1`, [id])).rows[0].test, true);
});
test("monthly USDC shares the service-period key, schedules an unsigned invoice and cancels future links", async t => {
  assert.equal(process.env.SDS_PRIVATE_PREVIEW, "1");
  const pool = new pg.Pool({ connectionString: process.env.SDS_CARE_DATABASE_URL });
  const store = openCareStore();
  t.after(async () => { await pool.end(); await store.close(); });
  const id = randomUUID();
  const service = createCareService({ store, stripe: {}, live: false, origin, secret, orderPayments: true });
  await service.startUsdc("keep_it_working", id, email);
  const row = await store.order(id), q = railQuote(row);
  const call = (action, body) => store.usdc.change(row.rail_id, action, body || {});
  const attempt = { payer, nonce: "0x" + "a".repeat(64), nextBlock: "80", protocol: "mpp", version: q.version };
  await call("anchor", { block: "80" });
  assert.ok((await call("arm", { attempt })).armed);
  const result = { state: "paid", evidence: { asset, recipient: merchant, payer, transaction: "0x" + "9".repeat(64), logIndex: 0, transferLogIndex: 1,
    nonce: attempt.nonce, block: "80", blockHash: "0x" + "8".repeat(64), timestamp: String(Math.ceil(q.created/1000)), amount: "100000000" } };
  await call("observe", { attempt, result }); await call("observe", { attempt, result });
  const period = (await pool.query(`select * from ${careTable("care_periods")} where order_id=$1`, [id])).rows;
  assert.equal(period.length, 1); assert.equal(period[0].status, "ready");
  const child = (await pool.query(`select * from ${careTable("care_orders")} where rail_parent=$1`, [id])).rows[0];
  assert.equal(child.rail_period_start.toISOString(), period[0].period_end.toISOString());
  assert.equal(child.rail_attempt, null);
  assert.equal((await store.usdc.change(child.rail_id, "load", {})).state, "closed");
  assert.equal((await pool.query(`select count(*)::int n from ${careTable("care_mail")} where order_id=$1 and kind='monthly_invoice'`, [id])).rows[0].n, 1);
  // Advance the isolated clock to the due date for a real second paid period.
  t.mock.method(Date, "now", () => child.rail_period_start.getTime() + 1000);
  const nextQuote = await store.usdc.change(child.rail_id,"load",{});
  const nextAttempt = { ...attempt, version: nextQuote.version, nonce: "0x" + "d".repeat(64) };
  await store.usdc.change(child.rail_id,"anchor",{ block:"80" });
  assert.ok((await store.usdc.change(child.rail_id,"arm",{ attempt:nextAttempt })).armed);
  const nextResult = { state:"paid",evidence:{ ...result.evidence, transaction:"0x"+"e".repeat(64),nonce:nextAttempt.nonce,
    timestamp:String(Math.ceil(nextQuote.created/1000)) } };
  assert.equal((await store.usdc.change(child.rail_id,"observe",{ attempt:nextAttempt,result:nextResult })).state,"paid");
  assert.equal((await pool.query(`select count(*)::int n from ${careTable("care_periods")} where order_id=$1`,[id])).rows[0].n,2);
  assert.equal((await pool.query(`select order_id from ${careTable("care_mail")} where mail_key=$1`,["receipt/"+child.id])).rows[0].order_id,id);
  await store.subscriptionState(id, { status: "active", cancel: true, at: new Date() });
  assert.equal((await store.usdc.change(child.rail_id, "arm", { attempt })).armed, false);
});

test("written scope issues one payment choice and one paid task under card/USDC contention", async t => {
  const pool = new pg.Pool({connectionString:process.env.SDS_CARE_DATABASE_URL});
  const store = openCareStore();
  t.after(async()=>{ await pool.end(); await store.close(); });
  const service = createCareService({store,stripe:{},live:false,origin,secret,orderPayments:true});
  const request = await store.taskRequests.insert({email,task:"Inspect the agreed checkout and verify the result."});
  const terms={amountCents:17700,scope:"Repair the accepted checkout scope.",acceptance:"The agreed client can check out."};
  const issued=await service.issueQuote(request.id,terms);
  assert.deepEqual(await service.issueQuote(request.id,terms),issued);
  const key=issued.url.split("/").at(-1);
  assert.equal((await service.selectQuote(key)).cents,17700);
  const selected=await service.selectQuote(key,"usdc");
  await assert.rejects(service.selectQuote(key,"stripe"),{status:409});
  const id=selected.paymentUrl.split("/").at(-1);
  const call=(action,body={})=>service.quoteRail.change(id,action,body);
  const q=await call("load"); const attempt={version:q.version,nonce:"0x"+"3".repeat(64),payer,protocol:"mpp",nextBlock:"81"};
  await call("anchor",{block:"81"});
  assert.equal((await Promise.all([call("arm",{attempt}),call("arm",{attempt})])).filter(x=>x.armed).length,1);
  const result={state:"paid",evidence:{asset,recipient:merchant,payer,nonce:attempt.nonce,logIndex:0,transferLogIndex:1,
    amount:"177000000",transaction:"0x"+"4".repeat(64),blockHash:"0x"+"5".repeat(64),block:"81",timestamp:String(Math.ceil(q.created/1000))}};
  await call("observe",{attempt,result}); await call("observe",{attempt,result});
  const paid = await store.quotes.order(issued.quoteId);
  assert.ok(paid.paid_at); assert.equal(paid.stripe_link,null); assert.equal(paid.payment_intent,null);
  assert.equal((await pool.query(`select status from ${careTable("task_requests")} where id=$1`,[request.id])).rows[0].status,"paid");
});

test("anonymous repair uses the existing hosted order, receipt and offer under rail contention",async t=>{
  const pool=new pg.Pool({connectionString:process.env.SDS_CARE_DATABASE_URL}), store=openCareStore();
  t.after(async()=>{await pool.end();await store.close();});
  const input={order:randomUUID(),findingId:"hypernatt-liq-radar-20260830",email,method:"usdc",stripe:{},origin,live:false};
  const res=await store.hostedRail.start(input);
  assert.deepEqual(await store.hostedRail.start(input),res);
  await assert.rejects(store.hostedRail.start({...input,method:"stripe"}),{status:409});
  const id=res.paymentUrl.split("/").at(-1),call=(action,body={})=>store.hostedRail.change(id,action,body);
  const q=await call("load");
  const attempt={payer,nonce:"0x"+"6".repeat(64),version:q.version,protocol:"x402",nextBlock:"89"};
  await call("anchor",{block:"89"});assert.ok((await call("arm",{attempt})).armed);
  const result={state:"paid",evidence:{asset,recipient:merchant,payer,nonce:attempt.nonce,logIndex:0,transferLogIndex:1,
    amount:"490000000",transaction:"0x"+"7".repeat(64),blockHash:"0x"+"8".repeat(64),block:"89",timestamp:String(Math.floor(q.created/1000))}};
  await Promise.all([call("observe",{attempt,result}),call("observe",{attempt,result})]);
  const hosted=(await pool.query(`select * from ${careTable("hosted_orders")} where order_key=$1`,[input.order])).rows;
  assert.equal(hosted.length,1);assert.equal(hosted[0].state,"received");assert.equal(hosted[0].payment_intent_id,null);
  assert.equal(hosted[0].checkout_details.findingId,input.findingId);
  const mail=await pool.query(`select * from ${careTable("care_mail")} where hosted_order_id=$1`,[res.order]);
  assert.equal(mail.rowCount,1);assert.equal(mail.rows[0].details.email,email);
});

test("Care receipt expires only a genuinely unused quote and keeps late finality recoverable", async t => {
  assert.equal(process.env.SDS_PRIVATE_PREVIEW, "1");
  const pool = new pg.Pool({ connectionString: process.env.SDS_CARE_DATABASE_URL });
  const store = openCareStore();
  t.after(async () => { await store.close(); await pool.end(); });

  let clock = Date.now();
  const service = createCareService({ store, stripe: {}, live: false, origin, secret, orderPayments: true, now: () => new Date(clock) });
  const open = async (offer = "machine_payment_route") => {
    const id = randomUUID();
    const selected = await service.startUsdc(offer, id, email);
    const key = new URLSearchParams(new URL(selected.receipt).hash.slice(1)).get("key");
    const row = await store.order(id);
    const change = (action, body = {}) => store.usdc.change(row.rail_id, action, body);
    return { id, row, key, change, quote: await change("load"), selected, read: () => service.read(id, key) };
  };
  const unused = await open();
  const signed = await open();
  const monthly = await open("keep_it_working");
  await unused.change("anchor", { block: "10" });
  await signed.change("anchor", { block: "10" });
  const attempt = { protocol: "x402", payer, nonce: "0x" + "5".repeat(64), version: signed.quote.version, nextBlock: "10" };
  assert.equal((await signed.change("arm", { attempt })).armed, true);
  await signed.change("submitted", { attempt, result: { reason: "provider_outcome_unknown" } });

  const unchanged = () => store.order(unused.id);
  const initial = await unchanged();
  clock = unused.quote.expires - 1;
  assert.equal((await unused.read()).paymentState, "waiting");
  clock += 1;
  t.mock.method(Date, "now", () => clock);
  const view = await unused.read();
  assert.deepEqual([view.state, view.paymentState], ["expired", "expired"]);
  assert.equal(view.wallet, unused.selected.wallet);
  assert.equal(view.paymentUrl, unused.selected.paymentUrl);
  assert.deepEqual(await unchanged(), initial);
  const retry = await unused.change("load");
  assert.equal(retry.state, "waiting"); // Gateway owns the 410 and late signed-request readback.
  assert.deepEqual([retry.version, retry.cents, retry.created, retry.expires],
    [unused.quote.version, unused.quote.cents, unused.quote.created, unused.quote.expires]);
  assert.equal((await unused.change("arm", { attempt: { ...attempt, version: retry.version } })).armed, false);
  assert.deepEqual([(await monthly.read()).state, (await monthly.read()).paymentState], ["expired", "expired"]);

  clock = signed.quote.expires + 18 * 60_000 + 33_000;
  const pending = await signed.read();
  assert.deepEqual([pending.state, pending.paymentState], ["created", "seen"]);
  await signed.change("observe", { attempt, result: { state: "seen", nextBlock: "11" } });
  const proof = { asset, recipient: merchant, payer, nonce: attempt.nonce, transaction: "0x" + "6".repeat(64),
    logIndex: 0, transferLogIndex: 1, block: "11", blockHash: "0x" + "7".repeat(64),
    timestamp: String(Math.floor((signed.quote.expires - 1) / 1000)), amount: "499000000" };
  assert.equal((await signed.change("observe", { attempt, result: { state: "paid", evidence: proof } })).state, "paid");
  const paid = await signed.read();
  assert.deepEqual([paid.state, paid.paymentState], ["paid", "paid"]);
});
