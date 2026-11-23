import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { startDisposablePg } from "./fixtures/disposable-pg.mjs";
import { projectRailChange } from "../lib/order-rail-state.js";
import { accountUsdc, accountRailQuote } from "../lib/account-usdc.js";

// Verify the account adapter's exact SQL and the browser-role boundary on disposable PostgreSQL.
test("stored USDC attempt produces one account order from frozen intake and preserves the original Stripe id", async t => {
  const cluster = await startDisposablePg(), pool = new pg.Pool({ connectionString: cluster.url });
  t.after(async () => { await pool.end(); await cluster.stop(); });
  await pool.query("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key)");
  const migration = name => readFile(new URL("../../supabase/migrations/" + name, import.meta.url),"utf8");
  const initial = await migration("0001_init.sql");
  for (const name of ["profiles","orders"]) {
    await pool.query(initial.match(new RegExp("create table if not exists public\\." + name + " \\([\\s\\S]*?\\n\\);"))[0]);
  }
  await pool.query(await migration("0004_repeat_purchase_attempts.sql"));
  await pool.query(await migration("0018_account_order_rail.sql"));
  const uid = randomUUID(), id = "attempt_" + randomUUID(), rail = randomUUID();
  await pool.query("insert into auth.users values($1)", [uid]);
  await pool.query("insert into public.profiles(id) values($1)", [uid]);
  const { rows: [a] } = await pool.query(`insert into public.payment_attempts(id,user_id,offer,amount,currency,
    facts_hash,stripe_create_params,stripe_payment_intent,intake_snapshot,intake_hash,checkout_rail,rail_id)
    values ($1,$2,'agent_workflow',14900,'usd','hash',$3,'pi_original',$4,'frozen','usdc',$5) returning *`,
    [id,uid,{ receipt_email:"owner@example.test", metadata:{label:"Workflow"} },{ details:"my accepted scope", uploadPath:"" },rail]);
  const q = accountRailQuote(a);
  async function applyAt(revision,patch,state) {
    return (await pool.query("select public.account_usdc_transition($1,$2,$3,$4) applied",[rail,revision,patch,state])).rows[0].applied;
  }
  const attempt = { nonce:"0x" + "a".repeat(64),payer:"0x" + "1".repeat(40),version:q.version,nextBlock:"15",protocol:"x402" };
  const anchor = projectRailChange(q,"anchor",{ block:"15" });
  assert.ok(await applyAt(0,anchor.patch,"waiting"));
  const armed = projectRailChange({ ...q,...anchor.patch },"arm",{ attempt });
  const seen = { ...anchor.patch,...armed.patch };
  assert.equal((await Promise.all([applyAt(1,seen,"seen"),applyAt(1,seen,"seen")])).filter(Boolean).length,1);
  const evidence = { asset:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",recipient:"0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee",payer:attempt.payer,
    nonce:attempt.nonce,amount:"149000000",transaction:"0x" + "b".repeat(64),blockHash:"0x" + "c".repeat(64),block:"15",
    logIndex:0, transferLogIndex:1,timestamp:String(Math.ceil(q.created/1000)) };
  const change = projectRailChange({ ...q,...seen },"observe",{ attempt,result:{ state:"paid",evidence } });
  const paid = { ...seen,...change.patch };
  assert.equal((await Promise.all([applyAt(2,paid,"paid"),applyAt(2,paid,"paid")])).filter(Boolean).length,1);
  const ord = (await pool.query("select * from public.orders where user_id=$1",[uid])).rows;
  assert.equal(ord.length,1); assert.equal(ord[0].meta.intake.details,"my accepted scope");
  assert.equal(ord[0].stripe_payment_intent,null); assert.equal(ord[0].id,"order_" + id);
  const stored = (await pool.query("select * from public.payment_attempts where id=$1",[id])).rows[0];
  assert.equal(stored.stripe_payment_intent,"pi_original"); assert.equal(stored.status,"succeeded");
  const mark = async (key,ack) => (await pool.query("select public.account_usdc_delivery($1,$2,$3) as ok",[rail,key,ack])).rows[0].ok;
  assert.ok(await mark("receipt",false));
  assert.ok(await mark("receipt",true));
  assert.equal(await mark("receipt",false),false);
  assert.equal(await mark("payment_refunded",false),false);
  assert.equal(await mark("unsupported",false),false);
  await assert.rejects(applyAt(3,{ ...paid,receipt:{ ...evidence,transaction:"0x"+"f".repeat(64) } },"paid"),/identity changed/);
  const privileges = await pool.query("select has_function_privilege('anon','public.account_usdc_transition(uuid,bigint,jsonb,text)','EXECUTE') as anon, has_function_privilege('authenticated','public.account_usdc_transition(uuid,bigint,jsonb,text)','EXECUTE') as member");
  assert.deepEqual(privileges.rows[0],{anon:false,member:false});
});

test("method switch resumes a lost Stripe cancel and never admits a processing card", async () => {
  for (const mode of ["lost_reply","card_processing"]) {
    const uid = randomUUID(), id = "attempt_" + randomUUID();
    const row = { id,user_id:uid,offer:"agent_workflow",amount:14900,currency:"usd",created_at:new Date().toISOString(),
      status:"open",checkout_rail:"stripe",stripe_payment_intent:"pi_test",facts_hash:"facts",intake_hash:"frozen",
      stripe_create_params:{ receipt_email:"owner@example.test" } };
    // The query stub enforces each equality predicate from the production adapter.
    const getAdmin = () => ({ from:() => { let patch; const filters = [];
      return { select(){return this;}, update(p){ patch=p; return this; }, eq(k,v){ filters.push([k,v]);return this; },
        async maybeSingle(){ if(!filters.every(([k,v])=>row[k]===v)) return { data:null };
          Object.assign(row,patch); return { data:structuredClone(row) }; } }; },
      rpc:async()=>({ data:true }) });
    let calls=0;
    const intent = { id:"pi_test",metadata:{ payment_attempt_id:id,uid },amount:row.amount,currency:"usd",livemode:false,
      status:mode === "lost_reply" ? "requires_confirmation" : "processing" };
    const stripe = { paymentIntents:{ retrieve:async()=>structuredClone(intent),cancel:async(_id,_params,options)=>{
      assert.equal(options.idempotencyKey,"sds-method-switch/" + id); calls++;intent.status="canceled";throw Error("reply lost"); } } };
    const service=accountUsdc({ getAdmin,stripe,enabled:true,live:false,prepareIntake:async()=>({ ok:true }),journey:async()=>true });
    const start=()=>service.start({ uid,paymentAttemptId:id,intake:{} });
    await assert.rejects(start); assert.equal(row.checkout_rail,"switching");
    if(mode === "card_processing") {
      await assert.rejects(start); assert.equal(calls,0); assert.equal(row.checkout_rail,"switching");
    } else {
      const output=await start(); assert.equal(output.order,id); assert.equal(row.checkout_rail,"usdc");assert.equal(calls,1);
      assert.deepEqual(await start(),output); assert.equal(calls,1);
    }
  }
});
