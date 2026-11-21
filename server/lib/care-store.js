import { randomUUID } from "node:crypto";
import { lstatSync } from "node:fs";
import { isAbsolute } from "node:path";
import pg from "pg";
import { CareError } from "./care-contract.js";
import { createTaskQuoteStore } from "./task-quotes.js";
import { recordJourney } from "./journey-events.js";

const first = async (query) => (await query).rows[0] ?? null;

export function careDatabaseOptions(env = process.env) {
  if (!env.SDS_CARE_DATABASE_URL) return null;
  const url = new URL(env.SDS_CARE_DATABASE_URL);
  if (!["postgresql:", "postgres:"].includes(url.protocol) || !url.hostname ||
      ["sslmode", "ssl", "sslrootcert", "sslkey", "sslcert"].some((name) => url.searchParams.has(name))) {
    throw new Error("Use a PostgreSQL connection without URL TLS overrides for SameDayDesk care");
  }
  const preview = env.SDS_PRIVATE_PREVIEW === "1";
  if (preview && url.hostname !== "127.0.0.1") throw new Error("Use an isolated loopback database for care preview");
  for (const key of url.searchParams.keys()) {
    if (!preview || !["host", "port"].includes(key) || url.searchParams.getAll(key).length !== 1) throw new Error("Unexpected Care database URL option");
  }
  if (url.searchParams.has("host")) {
    const socket = url.searchParams.get("host");
    const stat = isAbsolute(socket) && lstatSync(socket);
    if (!stat?.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.uid !== process.getuid()) {
      throw new Error("Care preview socket requires a private directory owned by this worker user");
    }
  }
  if (!preview && !env.SDS_CARE_DATABASE_CA_BASE64) throw new Error("Care database requires its verified TLS CA");
  const ssl = preview ? false : { rejectUnauthorized: true, ca: Buffer.from(env.SDS_CARE_DATABASE_CA_BASE64, "base64").toString("utf8") };
  return { connectionString: url.href, ssl, max: 3, connectionTimeoutMillis: 4000 };
}

export function openCareStore(env = process.env) {
  const options = careDatabaseOptions(env);
  return options ? createCareStore(new pg.Pool(options)) : null;
}

export function createCareStore(pool) {
  async function txn(run) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }
  const order = (id, db = pool, lock = "") => first(db.query(`select * from public.care_orders where id = $1 ${lock}`, [id]));
  const conflict = () => new CareError(409, "This request is already linked to a different checkout.");
  const mail = (db, id, key, kind, details = {}) => db.query(`
    insert into public.care_mail(mail_key, order_id, kind, details) values ($1,$2,$3,$4)
    on conflict (mail_key) do nothing`, [key, id, kind, details]);

  return {
    order,
    bySubscription: (id) => first(pool.query("select * from public.care_orders where subscription_id = $1", [id])),
    byPayment: (id) => first(pool.query("select * from public.care_orders where payment_intent_id = $1", [id])),
    paidBefore: (row) => first(pool.query(`select id from public.care_orders
      where stripe_email = $1 and id <> $2 and received_at <= $3 limit 1`,
    [row.stripe_email, row.id, row.received_at])),
    close: () => pool.end(),
    quotes: createTaskQuoteStore(pool, txn),
    taskRequests: { insert: (request) => first(pool.query(`insert into public.task_requests(email,website,task)
      values ($1,$2,$3) returning *`, [request.email, request.website, request.task])) },

    async reserve({ id, offer, cents, live, expires, origin, integrationId, journeySession }) {
      await pool.query(`insert into public.care_orders
        (id, offer, amount_cents, live_mode, checkout_expires_at, checkout_origin, integration_id, journey_session)
        values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (id) do nothing`,
      [id, offer, cents, live, expires, origin, integrationId, journeySession || id]);
      const row = await order(id);
      if (!row || row.offer !== offer || row.amount_cents !== cents || row.live_mode !== live || row.checkout_origin !== origin) throw conflict();
      return row;
    },

    async bindSession({ id, sessionId }) {
      const row = await first(pool.query(`update public.care_orders set session_id = $2 where id = $1
        and (session_id is null or session_id = $2) returning *`, [id, sessionId]));
      if (!row) throw conflict();
      return row;
    },

    async checkoutPaid({ id, sessionId, customerId, paymentId, subscriptionId, email, at }) {
      let paidOffer;
      const result = await txn(async (db) => {
        const current = await order(id, db, "for update");
        if (!current || (current.session_id && current.session_id !== sessionId) ||
            (current.customer_id && current.customer_id !== customerId) ||
            (current.payment_intent_id && current.payment_intent_id !== paymentId) ||
            (current.subscription_id && current.subscription_id !== subscriptionId)) throw conflict();
        if (["paid", "refunded", "review"].includes(current.state)) return current;
        const result = await first(db.query(`update public.care_orders set state = 'paid', session_id = $2,
          customer_id = $3, payment_intent_id = $4, subscription_id = $5, stripe_email = $6, received_at = $7
          where id = $1 returning *`, [id, sessionId, customerId, paymentId, subscriptionId, email, at]));
        await mail(db, id, `receipt/${id}`, "receipt");
        paidOffer = current.offer;
        return result;
      });
      if (paidOffer) recordJourney("payment_confirmed", { path: "/care/intake", offer: paidOffer, state: "paid" }, "server");
      return result;
    },

    async expire(id, sessionId) {
      await pool.query(`update public.care_orders set state = 'expired', session_id = $2
        where id = $1 and state = 'created' and (session_id is null or session_id = $2)`, [id, sessionId]);
    },

    async intake(id, input) {
      return txn(async (db) => {
        const row = await order(id, db, "for update");
        if (row?.state !== "paid") throw new CareError(409, "Payment has not been confirmed for this order.");
        if (row.intake) {
          if (!Object.keys(input).every((key) => row.intake[key] === input[key])) {
            throw new CareError(409, "We already received this intake. Reply to the confirmation to change the scope.");
          }
          return row;
        }
        const next = await first(db.query("update public.care_orders set intake = $2 where id = $1 returning *", [id, input]));
        await mail(db, id, `intake/${id}`, "intake");
        return next;
      });
    },

    async paidPeriod(id, invoiceId, { start, end }) {
      return txn(async (db) => {
        const current = await order(id, db, "for update");
        if (current?.state !== "paid") return;
        await db.query(`insert into public.care_periods(invoice_id, order_id, period_start, period_end, status)
          values ($2,$1,$3,$4, case when exists (
            select 1 from public.care_period_holds where order_id = $1 and invoice_id = $2
          ) then 'review' else 'ready' end) on conflict do nothing`, [id, invoiceId, start, end]);
      });
    },

    async subscriptionState(id, { status, cancel, at }) {
      return txn(async (db) => {
        const prior = await order(id, db, "for update");
        if (!prior || (prior.subscription_event_at && prior.subscription_event_at > at)) return;
        await db.query(`update public.care_orders set subscription_status = $2, cancel_at_period_end = $3,
          subscription_event_at = $4 where id = $1`, [id, status, cancel, at]);
        if (!prior.cancel_at_period_end && cancel) await mail(db, id, `cancel/${id}/${at.toISOString()}`, "cancellation");
      });
    },

    async refundOrRisk(id, { totalRefund = false, refundCents = 0, invoiceId = null } = {}) {
      await txn(async (db) => {
        await db.query(`update public.care_orders set
          state = case when state = 'refunded' or $2 then 'refunded' when $3 = 0 and $4::text is null then 'review' else state end,
          refunded_cents = greatest(refunded_cents, $3) where id = $1`, [id, totalRefund, refundCents, invoiceId]);
        if (invoiceId) await db.query(`insert into public.care_period_holds(invoice_id,order_id)
          values ($1,$2) on conflict do nothing`, [invoiceId, id]);
        await db.query(`update public.care_periods set status = 'review'
          where order_id = $1 and (invoice_id = $2 or $2::text is null) and status in ('ready', 'assigned')`, [id, invoiceId]);
      });
    },

    async admitSentinel(id, { spec, at = new Date() }) {
      return txn(async (db) => {
        const current = await order(id, db, "for update");
        if (current?.offer !== "keep_it_working" || current.state !== "paid" || !current.intake) return null;
        const assigned = await first(db.query(`select * from public.care_periods where order_id = $1
          and status = 'assigned' order by period_start limit 1`, [id]));
        if (assigned) return assigned;
        return first(db.query(`with due as (
          select invoice_id from public.care_periods where order_id = $1 and status = 'ready'
            and period_start <= $2 order by period_start limit 1 for update
          ) update public.care_periods p set status = 'assigned', lease = $3, package_spec = $4,
            task_ref = $5 from due where p.invoice_id = due.invoice_id returning p.*`,
        [id, at, randomUUID(), spec, randomUUID()]));
      });
    },

    async markSentinelDispatch(id, lease, at = new Date()) {
      return txn(async (db) => {
        if ((await order(id, db, "for update"))?.state !== "paid") return null;
        return first(db.query(`update public.care_periods set dispatch_at = $3
          where order_id = $1 and lease = $2 and status = 'assigned' and dispatch_at is null returning *`,
        [id, lease, at]));
      });
    },

    async recordSentinelRun(id, lease, runId) {
      await pool.query(`update public.care_periods set run_id = $3 where order_id = $1 and lease = $2
        and status = 'assigned' and dispatch_at is not null and (run_id is null or run_id = $3)`, [id, lease, runId]);
    },

    async reportSentinel(id, lease, runId, checks) {
      return txn(async (db) => {
        if ((await order(id, db, "for update"))?.state !== "paid") return false;
        const period = await first(db.query(`select * from public.care_periods where order_id = $1
          and lease = $2 and run_id = $3 and status = 'assigned' for update`, [id, lease, runId]));
        if (!period) return false;
        const report = { start: period.period_start, end: period.period_end, package: period.package_spec, checks };
        await db.query("update public.care_periods set status = 'reported',report = $2 where invoice_id = $1",
          [period.invoice_id, report]);
        await mail(db, id, `report/${period.invoice_id}`, "report", report);
        return true;
      });
    },

    async nextMail(at = new Date()) {
      return first(pool.query(`with chosen as (
        select mail_key from public.care_mail where accepted_at is null and next_attempt_at <= $1
          and (first_attempt_at is null or first_attempt_at > $1::timestamptz - interval '23 hours')
          order by created_at limit 1 for update skip locked
        ) update public.care_mail m set claim_id = $2,
          first_attempt_at = coalesce(m.first_attempt_at, $1), next_attempt_at = $1::timestamptz + interval '5 minutes'
        from chosen where m.mail_key = chosen.mail_key returning m.*`, [at, randomUUID()]));
    },

    async acceptMail(key, claim, provider) {
      await pool.query(`update public.care_mail set accepted_at = now(), provider_id = $3 where mail_key = $1
        and claim_id = $2 and accepted_at is null`, [key, claim, provider]);
    },
  };
}
