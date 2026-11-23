import { createHash } from "node:crypto";
import { CareError } from "./care-contract.js";
import { projectRailChange } from "./order-rail-state.js";
import { recordRailEvent } from "./care-usdc.js";

const conflict = () => new CareError(409, "This quote already has a payment in progress or needs review.");
const missing = () => new CareError(404, "Quote not found.");

export function taskRailQuote(row) {
  const created = new Date(row.rail_opened_at).getTime();
  const version = createHash("sha256").update(JSON.stringify([row.id,row.request_id,row.amount_cents,row.scope,
    row.acceptance,row.live_mode,created,row.rail_id])).digest("hex");
  return { id: row.rail_id, resource: "https://agents.samedaydesk.com/order-payments/sds/" + row.rail_id,
    created, expires: created + 7200000, version, cents: row.amount_cents, state: "waiting", ...row.rail_state };
}

export function taskQuoteRail(txn, table) {
  const quotes = table("task_quotes"), requests = table("task_requests");
  async function lookup(db, column, id) {
    const row = (await db.query(`select q.*,r.email as recipient,r.status as request_status from ${quotes} q join ${requests} r
      on r.id=q.request_id where q.${column}=$1 for update of q,r`,[id])).rows[0];
    if (!row) throw missing();
    return row;
  }
  const event = (db,row,type) => recordRailEvent(db,table,{ ...row,journey_session:row.request_id,
    rail_attempt:row.rail_state.attempt },type);
  async function select(key,method) {
    return txn(async db => {
      let row = await lookup(db,"checkout_key",key);
      if (!method) return row;
      if (!["stripe","usdc"].includes(method) || row.needs_review || row.paid_at || row.request_status !== "quoted" ||
          !["choice",method].includes(row.checkout_rail) || (method === "usdc" && (row.stripe_price || row.stripe_link))) throw conflict();
      if (row.checkout_rail === "choice") {
        const update = await db.query(`update ${quotes} set checkout_rail=$2,rail_opened_at=now() where id=$1 returning *`,[row.id,method]);
        row = { ...row,...update.rows[0] };
        if (method === "usdc") await event(db,row,"checkout_started");
      }
      return row;
    });
  }
  async function change(id,action,body) {
    return txn(async db => {
      const row=await lookup(db,"rail_id",id);
      if (row.checkout_rail !== "usdc") throw missing();
      const q=taskRailQuote(row);
      const plan=projectRailChange(q,action,body);
      if (!plan.patch) return plan.value;
      if (plan.patch.state === "paid" && (row.request_status !== "quoted" || row.needs_review || row.paid_at)) {
        plan.patch.state="held"; plan.patch.reason="quote_no_longer_open";
      }
      const state={ ...row.rail_state,...plan.patch };
      await db.query(`update ${quotes} set rail_state=$2,
        paid_at=case when $3='paid' then to_timestamp($4::bigint) else paid_at end,
        needs_review=needs_review or $3 in ('held','refund_pending','refunded') where id=$1`,
        [row.id,state,plan.patch.state ?? "",plan.patch.state === "paid" ? state.receipt.timestamp : null]);
      if (plan.patch.state === "paid") {
        await db.query(`update ${requests} set status='paid' where id=$1`,[row.request_id]);
        await event(db,row,"payment_verified");
      }
      if (plan.patch.state === "refunded") {
        await db.query(`update ${requests} set status='closed' where id=$1 and status='paid'`,[row.request_id]);
        await event(db,row,"payment_refunded");
      }
      return plan.value ?? { ...q,...state };
    });
  }
  return { select,change };
}
