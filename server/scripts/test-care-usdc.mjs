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
