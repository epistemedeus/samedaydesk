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
    const { resource, id: paymentReference } = railQuote(row);
    return { classification: "owner_qa", cents, paymentReference, agent: resource, wallet: resource + "/wallet" };
  } catch (error) { await db.query("rollback"); throw error; }
  finally { db.release(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [id, cents] = process.argv.slice(2);
  const options = careDatabaseOptions();
  if (!options || !/^(?:[1-9][0-9]?|100)$/.test(cents ?? "")) throw Error("expected enrolled store, stable QA UUID and exact approved cents");
  const pool = new Pool(options);
  try { console.log(JSON.stringify(await createOwnedOrder(pool, careSchema(), { id, cents: Number(cents),
    email: process.env.SDS_OWNER_QA_RECEIPT_EMAIL, live: process.env.SDS_PRIVATE_PREVIEW !== "1", origin: careOrigin(process.env) }))); }
  finally { await pool.end(); }
}
