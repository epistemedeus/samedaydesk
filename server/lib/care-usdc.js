import { checkRefund } from "./order-rail-state.js";
import { recordUsdcMonth } from "./care-usdc-month.js";
import { createHash } from "node:crypto";
import { CareError, CARE_OFFERS } from "./care-contract.js";

const merchant = "0x8904df3de6dfee6a7c8cc38619d2f17806213cee";
const asset = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const hex32 = /^0x[0-9a-f]{64}$/i;
const address = /^0x[0-9a-f]{40}$/i;
const uint = /^(0|[1-9][0-9]{0,17})$/;
const conflict = () => new CareError(409, "This payment needs review.");
const sameAttempt = (a, b) => a && b && a.nonce === b.nonce && a.payer === b.payer && a.version === b.version;

export function railQuote(row) {
  if (!row || row.checkout_rail !== "usdc" || !row.rail_id) return null;
  const cents = row.rail_qa_cents ?? row.amount_cents;
  const created = new Date(row.rail_period_start ?? row.created_at).getTime(), expires = new Date(row.checkout_expires_at).getTime();
  const resource = "https://agents.samedaydesk.com/order-payments/sds/" + row.rail_id;
  const version = createHash("sha256").update(JSON.stringify(["sds-care-v1", row.id, row.offer, row.live_mode,
    cents, row.rail_qa_cents, created, expires, resource])).digest("hex");
  const state = row.rail_refund?.state ?? row.rail_observation?.state ?? (row.rail_attempt ? "seen" : "waiting");
  return { id: row.rail_id, resource, version, cents, created, expires, state, startBlock: row.rail_start_block,
    attempt: row.rail_attempt, reason: row.rail_observation?.reason ?? row.rail_provider?.reason,
    receipt: row.rail_observation?.evidence && { ...row.rail_observation.evidence, refund: row.rail_refund?.evidence },
    refund: row.rail_refund, receiptHeaders: row.rail_provider?.headers };
}

export function createCareUsdcStore({ txn, table, mail }) {
  const name = table("care_orders");
  async function change(id, action, body) {
    return txn(async db => {
      const row = (await db.query(`select * from ${name} where rail_id=$1 and checkout_rail='usdc' for update`, [id])).rows[0];
      const quote = railQuote(row);
      if (!quote) throw new CareError(404, "Order not found.");
      const { attempt, result } = body;
      if (row.rail_parent && ["load","arm","observe"].includes(action)) {
        const parent = (await db.query(`select state,cancel_at_period_end from ${name} where id=$1 for update`, [row.rail_parent])).rows[0];
        if (quote.state === "waiting" && (parent?.state !== "paid" || parent.cancel_at_period_end ||
            Date.now() < quote.created)) {
          if (action === "arm") return { armed: false };
          return { ...quote, state: "closed" };
        }
        if (action === "observe" && result?.state === "paid" && (parent?.state !== "paid" || parent.cancel_at_period_end)) {
          body = { ...body, result: { ...result, state: "held", reason: "subscription_under_review" } };
        }
      }
      if (action === "load") return quote;
      if (action === "anchor") {
        if (!uint.test(body.block)) throw conflict();
        const block = quote.startBlock ?? body.block;
        if (quote.startBlock == null) await db.query(`update ${name} set rail_start_block=$2 where rail_id=$1`, [id, block]);
        return { block };
      }
      if (action === "arm") {
        if (row.state !== "created" || row.session_id || row.subscription_id || quote.state !== "waiting" ||
            quote.expires <= Date.now() || attempt?.version !== quote.version || !hex32.test(attempt.nonce) ||
            !address.test(attempt.payer) || !uint.test(attempt.nextBlock) || attempt.nextBlock !== quote.startBlock ||
            !["x402", "mpp"].includes(attempt.protocol)) return { armed: false };
        await db.query(`update ${name} set rail_attempt=$2 where rail_id=$1`, [id, {
          version: quote.version, nonce: attempt.nonce, payer: attempt.payer, protocol: attempt.protocol, nextBlock: attempt.nextBlock,
        }]);
        return { armed: true };
      }
      if (action === "refund-read") return quote;
      if (action === "refund-reserve") {
        if (row.rail_refund) return { won: false };
        const { refund } = body;
        checkRefund(quote, refund);
        await db.query(`update ${name} set rail_refund=$2,state='review' where rail_id=$1`, [id, refund]);
        return { won: true };
      }
      if (action === "refund-observe") {
        const refund = row.rail_refund;
        if (!refund || refund.original !== body.original) throw conflict();
        if (refund.state !== "refund_pending") return quote;
        const e = result.evidence, original = row.rail_observation?.evidence;
        if (result.state === "paid") {
          if (e?.amount !== original.amount || e.payer?.toLowerCase() !== merchant || e.recipient !== original.payer ||
              e.asset?.toLowerCase() !== asset || e.nonce !== refund.typedData.message.nonce || !hex32.test(e.transaction) ||
              !hex32.test(e.blockHash) || !uint.test(e.timestamp) || !Number.isSafeInteger(e.transferLogIndex)) throw conflict();
          refund.state = "refunded";
          refund.evidence = e;
        } else if (result.state === "held") {
          refund.state = "held";
          refund.reason = result.reason;
          refund.evidence = e;
        } else if (result.state === "seen" && uint.test(result.nextBlock) && BigInt(result.nextBlock) > BigInt(refund.nextBlock)) {
          refund.nextBlock = result.nextBlock;
        }
        const done = refund.state === "refunded";
        const updated = (await db.query(`update ${name} set rail_refund=$2,
          state=case when $3 then 'refunded' else state end,
          refunded_cents=case when $3 then $4 else refunded_cents end where rail_id=$1 returning *`,
          [id, refund, done, done ? String(BigInt(original.amount) / 10000n) : 0])).rows[0];
        if (done && row.offer === "keep_it_working") {
          await db.query(`update ${table("care_periods")} set status='review' where invoice_id=$1`, [row.rail_id]);
        }
        if (done) await recordRailEvent(db, table, updated, "payment_refunded");
        return railQuote(updated);
      }
      if (!sameAttempt(row.rail_attempt, attempt)) throw conflict();
      if (action === "submitted") {
        const provider = { ...row.rail_provider };
        if (result.transaction && hex32.test(result.transaction)) {
          if (provider.transaction && provider.transaction !== result.transaction) throw conflict();
          provider.transaction = result.transaction;
        }
        if (typeof result.reason === "string" && /^[A-Za-z0-9_:-]{1,96}$/.test(result.reason)) provider.reason = result.reason;
        if (result.headers) provider.headers = Object.fromEntries(Object.entries(result.headers)
          .filter(([key,value]) => ["payment-response","payment-receipt"].includes(key) && typeof value === "string" && /^[ -~]{1,8192}$/.test(value)));
        await db.query(`update ${name} set rail_provider=$2 where rail_id=$1`, [id, provider]);
        return {};
      }
      if (action !== "observe") throw new CareError(404, "Unknown payment operation.");
      if (quote.state !== "seen") return quote;
      if (result.state === "seen") {
        if (uint.test(result.nextBlock) && BigInt(result.nextBlock) > BigInt(row.rail_attempt.nextBlock)) {
          await db.query(`update ${name} set rail_attempt=$2 where rail_id=$1`, [id, { ...row.rail_attempt, nextBlock: result.nextBlock }]);
        }
        return quote;
      }
      const e = result.evidence;
      let observed = body.result;
      if (result.state === "paid") {
        if (!e || !hex32.test(e.transaction) || e.nonce !== attempt.nonce || e.payer !== attempt.payer ||
            e.recipient?.toLowerCase() !== merchant || e.asset?.toLowerCase() !== asset || !Number.isSafeInteger(e.logIndex) ||
            !hex32.test(e.blockHash) || !uint.test(e.timestamp) || !uint.test(e.block) ||
            !Number.isSafeInteger(e.transferLogIndex) || e.transferLogIndex <= e.logIndex) throw conflict();
        if (row.state !== "created" || row.session_id || row.subscription_id || attempt.version !== quote.version ||
            e.amount !== String(BigInt(quote.cents) * 10000n) || !CARE_OFFERS[row.offer] ||
            CARE_OFFERS[row.offer].cents !== row.amount_cents ||
            BigInt(e.timestamp) * 1000n >= BigInt(quote.expires) || BigInt(e.timestamp) < BigInt(Math.floor(quote.created / 1000)) ||
            (row.rail_provider?.transaction && e.transaction !== row.rail_provider.transaction)) {
          observed = { state: "held", reason: "order_changed", evidence: e };
        }
      } else if (result.state !== "held") throw conflict();
      if (observed.state === "paid" && row.offer === "keep_it_working") {
        const periodStart = row.rail_period_start ?? new Date(Number(BigInt(e.timestamp) * 1000n));
        const existing = await db.query(`select invoice_id from ${table("care_periods")} where order_id=$1 and period_start=$2`,
          [row.rail_parent ?? row.id, periodStart]);
        if (existing.rowCount) observed = { state: "held", reason: "service_period_already_paid", evidence: e };
      }
      const paid = observed.state === "paid";
      const updated = (await db.query(`update ${name} set rail_observation=$2, state=$3,
        received_at=case when $4 then to_timestamp($5::bigint) else received_at end where rail_id=$1 returning *`,
        [id, observed, paid ? "paid" : "review", paid, paid ? e.timestamp : null])).rows[0];
      if (paid) {
        if (row.offer === "keep_it_working") await recordUsdcMonth(db, table, updated, updated.received_at);
        await mail(db, row.rail_parent ?? row.id, `receipt/${row.id}`, "receipt", row.rail_parent ? { period: row.rail_period_start } : {});
        await recordRailEvent(db, table, updated, "payment_verified");
      }
      return railQuote(updated);
    });
  }
  return { change };
}

export async function recordRailEvent(db, table, row, event) {
  await db.query(`insert into ${table("journey_events")}(event_key, brand,event,session_id,test,order_id,is_agent,utm)
    values ($1,'samedaydesk',$2,$3,$4,$5,$6,$7) on conflict(event_key) do nothing`,
    [`samedaydesk/${event}/usdc/${row.rail_id}`, event, row.journey_session || row.id,
      !row.live_mode || row.rail_qa_cents != null, row.id, false, { payment_method: "base_usdc" }]);
}
