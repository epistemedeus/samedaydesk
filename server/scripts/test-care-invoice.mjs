// The non-card monthly route (SDS_CARE_NONCARD): a subscription that sends an invoice, paid by bank
// transfer or stablecoin on Stripe's hosted invoice page, on the real care store (scripts/release/care-preview-test.sh).
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createCareService } from "../lib/care-service.js";
import { careTable } from "../lib/care-database.js";
import { openCareStore } from "../lib/care-store.js";
import { careToken, NONCARD_PRICE_KEY } from "../lib/care-contract.js";

const secret = "isolated care access secret sufficient length";
const origin = "https://samedaydesk.com";

function fakeStripe() {
  const calls = [];
  const customers = new Map(), subscriptions = new Map(), invoices = new Map();
  let price = null, sequence = 0;
  const stripe = {
    calls,
    customers: {
      async create(args, options) { calls.push(["customers.create", args, options]);
        const customer = { id: `cus_inv${++sequence}`, livemode: false, email: args.email, metadata: args.metadata };
        customers.set(customer.id, customer); return customer; },
      async retrieve(id) { return customers.get(id); },
    },
    prices: {
      async list({ lookup_keys }) { assert.deepEqual(lookup_keys, [NONCARD_PRICE_KEY]); return { data: price ? [price] : [] }; },
      async create(args, options) { calls.push(["prices.create", args, options]);
        price = { id: "price_inv", active: true, livemode: false, currency: args.currency, unit_amount: args.unit_amount,
          recurring: { interval: args.recurring.interval, interval_count: 1 }, lookup_key: args.lookup_key };
        return price; },
    },
    subscriptions: {
      async create(args, options) { calls.push(["subscriptions.create", args, options]);
        const invoice = { id: `in_inv${++sequence}`, status: "draft", livemode: false, hosted_invoice_url: null };
        invoices.set(invoice.id, invoice);
        const subscription = { id: `sub_inv${sequence}`, livemode: false, customer: args.customer, metadata: args.metadata,
          latest_invoice: invoice.id, status: "active" };
        subscriptions.set(subscription.id, subscription); return subscription; },
      async retrieve(id) { return subscriptions.get(id); },
    },
    invoices: {
      async retrieve(id) { return invoices.get(id); },
      async finalizeInvoice(id, args) { calls.push(["invoices.finalize", id, args]);
        Object.assign(invoices.get(id), { status: "open", hosted_invoice_url: `https://invoice.stripe.com/i/acct_test/${id}` });
        return invoices.get(id); },
    },
    pay(id) { Object.assign(invoices.get(id), { status: "paid" }); },
  };
  return stripe;
}

const paidInvoice = (subscription, invoiceId, customer) => ({
  id: invoiceId, object: "invoice", livemode: false, status: "paid", currency: "usd", amount_paid: 10000,
  billing_reason: "subscription_create", customer, customer_email: "buyer@example.test",
  parent: { subscription_details: { subscription, metadata: {} } },
  lines: { has_more: false, data: [{ amount: 10000, period: { start: 1795300000, end: 1795300000 + 30 * 86400 } }] },
});

test("the monthly offer takes bank transfer and stablecoin by invoice only when switched on", async (t) => {
  const store = openCareStore();
  const db = new pg.Pool({ connectionString: process.env.SDS_CARE_DATABASE_URL });
  t.after(() => Promise.all([store.close(), db.end()]));
  const orders = (id) => db.query(`select * from ${careTable("care_orders")} where id = $1`, [id]).then((r) => r.rows[0]);

  const off = createCareService({ store, stripe: fakeStripe(), secret, origin, live: false });
  assert.deepEqual(off.methods("keep_it_working"), ["card"]);
  await assert.rejects(off.startInvoice("keep_it_working", randomUUID(), "bank_transfer", "buyer@example.test"), { status: 400 });

  const stripe = fakeStripe();
  const care = createCareService({ store, stripe, secret, origin, live: false, noncard: true, releaseRun: "SDS-NONCARD-TEST" });
  assert.deepEqual(care.methods("keep_it_working"), ["card", "bank_transfer", "stablecoin"]);
  assert.deepEqual(care.methods("agent_storefront"), ["card"]);
  await assert.rejects(care.startInvoice("agent_storefront", randomUUID(), "bank_transfer", "buyer@example.test"), { status: 400 });
  await assert.rejects(care.startInvoice("keep_it_working", randomUUID(), "bank_transfer", "not an email"), { status: 400 });

  for (const method of ["bank_transfer", "stablecoin"]) {
    const id = randomUUID();
    const started = await care.startInvoice("keep_it_working", id, method, "buyer@example.test");
    const receipt = new URL(started.receipt);
    assert.equal(receipt.origin, origin);
    assert.ok(receipt.hash.includes(careToken(secret, id, "intake")));
    const [, args, options] = stripe.calls.findLast(([name]) => name === "subscriptions.create");
    assert.equal(options.idempotencyKey, `sameday-care-subscription/${id}`);
    assert.equal(args.collection_method, "send_invoice");
    assert.equal(args.days_until_due, 7);
    assert.deepEqual(args.items, [{ price: "price_inv" }]);
    assert.deepEqual(args.metadata, { sds_care_order: id, journey_session: id, sds_care_method: method, release_run: "SDS-NONCARD-TEST" });
    assert.deepEqual(args.payment_settings.payment_method_types, method === "bank_transfer" ? ["customer_balance"] : ["crypto"]);
    if (method === "bank_transfer") assert.equal(args.payment_settings.payment_method_options.customer_balance.bank_transfer.type, "us_bank_transfer");
    const bound = await orders(id);
    assert.equal(bound.state, "created");
    assert.equal(bound.session_id, null);
    assert.match(bound.subscription_id, /^sub_inv/);
    const key = careToken(secret, id, "intake");
    const open = await care.read(id, key);
    assert.equal(open.state, "created");
    assert.match(open.invoiceUrl, /^https:\/\/invoice\.stripe\.com\//);

    // Resuming the same order reuses its customer and subscription, and refuses another method.
    const creates = stripe.calls.filter(([name]) => name === "subscriptions.create").length;
    await care.startInvoice("keep_it_working", id, method, "buyer@example.test");
    assert.equal(stripe.calls.filter(([name]) => name === "subscriptions.create").length, creates);
    await assert.rejects(care.startInvoice("keep_it_working", id, method === "bank_transfer" ? "stablecoin" : "bank_transfer", "buyer@example.test"),
      { status: 409 });

    // Stripe's invoice.paid confirms the order, records its paid month and queues the receipt.
    const invoiceId = (await stripe.subscriptions.retrieve(bound.subscription_id)).latest_invoice;
    stripe.pay(invoiceId);
    const event = { type: "invoice.paid", livemode: false, created: 1795300100,
      data: { object: paidInvoice(bound.subscription_id, invoiceId, bound.customer_id) } };
    assert.equal(await care.eventIsCare(event), true);
    assert.equal(await care.eventIsCare(event), true);
    const paid = await orders(id);
    assert.equal(paid.state, "paid");
    assert.equal(paid.stripe_email, "buyer@example.test");
    const periods = await db.query(`select * from ${careTable("care_periods")} where order_id = $1`, [id]);
    assert.equal(periods.rowCount, 1);
    const mail = await db.query(`select kind from ${careTable("care_mail")} where order_id = $1`, [id]);
    assert.deepEqual(mail.rows.map((row) => row.kind), ["receipt"]);
    const shown = await care.read(id, key);
    assert.equal(shown.state, "paid");
    assert.equal(shown.invoiceUrl, undefined);
    assert.equal(shown.subscription.status, "active");
  }
  assert.equal(stripe.calls.filter(([name]) => name === "prices.create").length, 1);
});
