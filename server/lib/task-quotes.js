import { randomUUID } from "node:crypto";
import { CareError, isOrderId, providerId } from "./care-contract.js";

const LIMIT = 23 * 3600_000;
const rowOf = async (query) => (await query).rows[0] || null;
const email = (value) => typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value.toLowerCase() : null;

export function quoteTerms({ amountCents, scope, acceptance }) {
  const text = (value, max) => typeof value === "string" && value.trim().length >= 12 && value.trim().length <= max ? value.trim() : null;
  if (!Number.isInteger(amountCents) || amountCents < 100 || amountCents > 99999999 ||
      !text(scope, 4000) || !text(acceptance, 2000)) throw new CareError(400, "Enter an exact USD amount, scope and acceptance check.");
  return { amountCents, scope: scope.trim(), acceptance: acceptance.trim() };
}

export function createTaskQuoteStore(pool, txn) {
  return {
    async reserve(requestId, terms, live) {
      return txn(async (client) => {
        const request = await rowOf(client.query("select * from public.task_requests where id = $1 for update", [requestId]));
        if (!request) throw new CareError(404, "Task request not found.");
        const fields = [requestId, terms.amountCents, terms.scope, terms.acceptance, live];
        if (request.status === "received") await client.query(`insert into public.task_quotes
          (id,request_id,amount_cents,scope,acceptance,live_mode) values ($1,$2,$3,$4,$5,$6)
          on conflict (request_id) do nothing`, [randomUUID(), ...fields]);
        const row = await rowOf(client.query("select * from public.task_quotes where request_id = $1", [requestId]));
        if (!row || row.paid_at || request.status === "closed" ||
            row.amount_cents !== terms.amountCents || row.scope !== terms.scope ||
            row.acceptance !== terms.acceptance || row.live_mode !== live) {
          throw new CareError(409, "This task already has a different quote or is no longer open.");
        }
        return { ...row, recipient: request.email };
      });
    },
    price: (id, priceId) => rowOf(pool.query(`update public.task_quotes set stripe_price = $2 where id = $1
      and (stripe_price is null or stripe_price = $2) returning *`, [id, priceId])),
    async offer(id, linkId, url) {
      return txn(async (client) => {
        const row = await rowOf(client.query(`update public.task_quotes set stripe_link = $2, stripe_url = $3
          where id = $1 and (stripe_link is null or stripe_link = $2) returning *`, [id, linkId, url]));
        if (!row) throw new CareError(409, "The quote already has a different link.");
        await client.query("update public.task_requests set status = 'quoted' where id = $1 and status = 'received'", [row.request_id]);
        return row;
      });
    },
    order: (id) => rowOf(pool.query("select * from public.task_quotes where id = $1", [id])),
    async paid(id, { sessionId, paymentId, payer, at }) {
      return txn(async (client) => {
        const row = await rowOf(client.query("select * from public.task_quotes where id = $1 for update", [id]));
        if (!row) throw new CareError(404, "Quote not found.");
        if (row.paid_at && (row.stripe_session !== sessionId || row.payment_intent !== paymentId)) {
          throw new CareError(409, "A different payment was already recorded for this quote.");
        }
        if (row.paid_at) return;
        const request = await rowOf(client.query("select email,status from public.task_requests where id = $1", [row.request_id]));
        const review = row.needs_review || request.status !== "quoted" || payer !== request.email.toLowerCase();
        await client.query(`update public.task_quotes set stripe_session = $2,payment_intent = $3,
          payer_email = $4,paid_at = $5,needs_review = $6 where id = $1`, [id, sessionId, paymentId, payer, at, review]);
        if (!review) await client.query("update public.task_requests set status = 'paid' where id = $1 and status = 'quoted'", [row.request_id]);
      });
    },
    hold: (paymentId) => pool.query("update public.task_quotes set needs_review = true where payment_intent = $1 returning id", [paymentId]),
    holdBeforeReceipt: (id) => pool.query("update public.task_quotes set needs_review = true where id = $1", [id]),
  };
}

function quoteUrl(value, live) {
  try {
    const url = new URL(value);
    if (url.origin === "https://buy.stripe.com" && !url.username && !url.password &&
        url.pathname.startsWith("/test_") === !live) return url.href;
  } catch { /* refused */ }
  throw new CareError(502, "Stripe returned an unexpected quote link.");
}

export function createTaskQuoteService({ store, stripe, live, now = () => new Date() }) {
  return {
    async issue(requestId, input) {
      if (!isOrderId(requestId)) throw new CareError(400, "Enter the exact task request ID.");
      const terms = quoteTerms(input);
      let row = await store.reserve(requestId, terms, live);
      const to = row.recipient;
      if (row.stripe_url) {
        const current = await stripe.paymentLinks.retrieve(row.stripe_link);
        if (!current.active || current.livemode !== live || current.url !== row.stripe_url ||
            current.metadata?.sds_task_quote !== row.id) throw new CareError(409, "The quote link is no longer open.");
      } else {
        if (now().getTime() - new Date(row.created_at).getTime() > LIMIT) {
          throw new CareError(409, "Reconcile the previous Stripe attempt before issuing a link.");
        }
        const metadata = { sds_task_quote: row.id };
        if (!row.stripe_price) {
          const price = await stripe.prices.create({ currency: "usd", unit_amount: row.amount_cents,
            product_data: { name: "SameDayDesk quoted work" }, metadata }, { idempotencyKey: `sds-task-price/${row.id}` });
          if (!providerId(price, "price") || price.livemode !== live || price.currency !== "usd" || price.unit_amount !== row.amount_cents) {
            throw new CareError(502, "Stripe did not confirm the quote amount.");
          }
          row = await store.price(row.id, price.id);
          if (!row) throw new CareError(409, "A different quote price was already recorded.");
        }
        const link = await stripe.paymentLinks.create({
          line_items: [{ price: row.stripe_price, quantity: 1 }],
          restrictions: { completed_sessions: { limit: 1 } },
          allow_promotion_codes: false,
          metadata, payment_intent_data: { metadata },
          after_completion: { type: "hosted_confirmation", hosted_confirmation: {
            custom_message: "Payment received. Keep your original SameDayDesk quote for the agreed scope and acceptance check.",
          } },
        }, { idempotencyKey: `sds-task-link/${row.id}` });
        if (!providerId(link, "plink") || !link.active || link.livemode !== live || link.metadata?.sds_task_quote !== row.id) {
          throw new CareError(502, "Stripe did not confirm the quote link.");
        }
        row = await store.offer(row.id, link.id, quoteUrl(link.url, live));
      }
      return { requestId, quoteId: row.id, to, amountCents: row.amount_cents, currency: "usd",
        scope: row.scope, acceptance: row.acceptance, url: quoteUrl(row.stripe_url, live) };
    },
    async event(event) {
      if (event.livemode !== live) return false;
      const raw = event.data?.object;
      if (!raw) return false;
      if (["charge.refunded", "charge.dispute.created", "radar.early_fraud_warning.created"].includes(event.type)) {
        let payment = providerId(raw.payment_intent, "pi");
        if (!payment && providerId(raw.charge, "ch")) payment = providerId((await stripe.charges.retrieve(raw.charge)).payment_intent, "pi");
        if (!payment) return false;
        if ((await store.hold(payment)).rowCount) return true;
        const intent = await stripe.paymentIntents.retrieve(payment);
        const id = intent.metadata?.sds_task_quote;
        if (!isOrderId(id) || intent.livemode !== live) return false;
        const existing = await store.order(id);
        if (existing?.live_mode !== live || existing.amount_cents !== intent.amount || intent.currency !== "usd") return false;
        await store.holdBeforeReceipt(id);
        return true;
      }
      const id = raw.metadata?.sds_task_quote;
      if (!isOrderId(id)) return false;
      const row = await store.order(id);
      if (!row || row.live_mode !== live) return false;
      if (event.type === "payment_intent.succeeded") return true; // Fulfilment is bound to the exact link below.
      if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) return false;
      if (!row.stripe_link) throw new CareError(503, "Waiting for the matching quote link.");
      if (providerId(raw.payment_link, "plink") !== row.stripe_link || raw.livemode !== live || raw.mode !== "payment" ||
          raw.amount_total !== row.amount_cents || raw.currency !== "usd" ||
          raw.status !== "complete" || !providerId(raw.id, "cs")) throw new CareError(409, "Payment does not match the quote.");
      if (raw.payment_status !== "paid") return true;
      const paymentId = providerId(raw.payment_intent, "pi");
      if (!paymentId) throw new CareError(409, "Payment details could not be matched.");
      await store.paid(id, { sessionId: raw.id, paymentId, payer: email(raw.customer_details?.email), at: now() });
      return true;
    },
  };
}
