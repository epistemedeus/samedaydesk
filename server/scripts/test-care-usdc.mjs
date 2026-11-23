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
