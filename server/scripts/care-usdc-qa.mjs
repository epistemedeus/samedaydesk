// Controller-run only. Use the same payment row/receipt engine and fixed QA principal.
// Reuse the same supplied UUID to resume an invocation after a disconnect.
import { Pool } from "pg";
import { fileURLToPath } from "node:url";
import { CARE_OFFERS, careOrigin, isOrderId, newIntegrationId } from "../lib/care-contract.js";
import { careDatabaseOptions, careSchema, careTable } from "../lib/care-database.js";
import { recordRailEvent, railQuote } from "../lib/care-usdc.js";
import { randomUUID } from "node:crypto";

export async function createOwnedOrder(pool, schema, { id, cents, email, live, origin }) {
  if (!isOrderId(id) || !Number.isInteger(cents) || cents < 1 || cents > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) throw Error("expected QA UUID, approved 1-100 cents and owner receipt inbox");
  const table = name => careTable(name, schema);
  const db = await pool.connect();
  try {
    await db.query("begin");
    await db.query(`insert into ${table("care_orders")}
      (id,offer,amount_cents,live_mode,checkout_expires_at,checkout_origin,integration_id,journey_session,checkout_rail,rail_id,rail_email,rail_qa_cents)
      values ($1,'machine_payment_route',$2,$3,now()+interval '2 hours',$4,$5,$1,'usdc',$6,$7,$8) on conflict(id) do nothing`,
      [id, CARE_OFFERS.machine_payment_route.cents, live, origin, newIntegrationId(), randomUUID(), email, cents]);
    const row = (await db.query(`select * from ${table("care_orders")} where id=$1 for update`, [id])).rows[0];
    if (row.rail_qa_cents !== cents || row.rail_email !== email || row.live_mode !== live || row.checkout_origin !== origin ||
        row.offer !== "machine_payment_route" || row.checkout_rail !== "usdc") throw Error("QA order identity differs");
    await recordRailEvent(db, table, row, "checkout_started");
    await db.query("commit");
    const { resource, version, id: paymentReference } = railQuote(row);
    return { classification: "owner_qa", cents, version, paymentReference, agent: resource, wallet: resource + "/wallet" };
  } catch (error) { await db.query("rollback"); throw error; }
  finally { db.release(); }
}

// Fetch one original site effect, its durable receipt and demand classification.
// A completed site record is distinct from protected signer and chain receiving.
export async function receiveOwnedOrder(pool,schema,id) {
  if(!isOrderId(id))throw Error("expected the original stable site QA UUID");
  const table=name=>careTable(name,schema),db=await pool.connect();
  try {
    await db.query("begin isolation level repeatable read read only");
    const row=(await db.query(`select * from ${table("care_orders")} where id=$1`,[id])).rows[0];
    if(!row || row.rail_qa_cents==null || row.offer!=="machine_payment_route" || row.checkout_rail!=="usdc")throw Error("marked site order not found");
    const q=railQuote(row),receipt=q.receipt,refund=receipt?.refund;
    const mail=(await db.query(`select accepted_at from ${table("care_mail")} where order_id=$1 and kind='receipt'`,[id])).rows;
    const events=(await db.query(`select event,test from ${table("journey_events")} where order_id=$1 order by event`,[id])).rows;
    const expectedAmount=String(BigInt(row.rail_qa_cents)*10000n);
    const one=name=>events.filter(e=>e.event===name && e.test).length===1;
    const roundTrip=q.state==="refunded" && row.state==="refunded" && row.refunded_cents===row.rail_qa_cents &&
      receipt?.amount===expectedAmount && refund?.amount===expectedAmount && receipt.transaction!==refund.transaction &&
      receipt.payer?.toLowerCase()===refund.recipient?.toLowerCase() && receipt.recipient?.toLowerCase()===refund.payer?.toLowerCase() &&
      receipt.asset?.toLowerCase()===refund.asset?.toLowerCase() && ["checkout_started","payment_verified","payment_refunded"].every(one) &&
      events.every(e=>e.test) && mail.length===1;
    await db.query("commit");
    return {classification:"owner_qa",liveMode:row.live_mode,order:id,paymentReference:row.rail_id,state:q.state,
      amountAtomic:expectedAmount,payer:receipt?.payer,original:receipt?.transaction,refund:refund?.transaction,
      demand:events.map(e=>({event:e.event,ownerQa:e.test})),receiptRows:mail.length,receiptAccepted:!!mail[0]?.accepted_at,
      siteRoundTripRecorded:Boolean(roundTrip),customerRevenue:false};
  } catch(error) {await db.query("rollback");throw error;} finally {db.release();}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [first,second,...extra] = process.argv.slice(2);
  const read=first==="--receive";
  const options=careDatabaseOptions();
  if(!options || extra.length || (read?!isOrderId(second):!isOrderId(first) || !/^(?:[1-9][0-9]?|100)$/.test(second ?? ""))) {
    throw Error("expected --receive UUID or UUID APPROVED_CENTS with the enrolled store");
  }
  const pool=new Pool(options);
  try {
    const result=read ? await receiveOwnedOrder(pool,careSchema(),second)
      : await createOwnedOrder(pool,careSchema(),{id:first,cents:Number(second),email:process.env.SDS_OWNER_QA_RECEIPT_EMAIL,
          live:process.env.SDS_PRIVATE_PREVIEW!=="1",origin:careOrigin(process.env)});
    console.log(JSON.stringify(result));
  } finally {await pool.end();}
}
