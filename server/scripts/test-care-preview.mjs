import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import pg from "pg";
import { createSdsApp } from "../app.js";
import { createCareService } from "../lib/care-service.js";
import { openCareStore } from "../lib/care-store.js";
import { careToken } from "../lib/care-contract.js";
import { drainCareMail } from "../lib/care-mail.js";
import { FROM, resend } from "../lib/resend.js";
import { stripe as signingClient } from "../lib/stripe.js";

test("built HTTP preview and real PostgreSQL receive both checkouts, money authority and branded delivery", async (t) => {
  const secret = "isolated care access secret sufficient length";
  const primary = randomUUID(), recurring = randomUUID(), expiring = randomUUID();
  const provider = new Map();
  const db = new pg.Pool({ connectionString: process.env.SDS_CARE_DATABASE_URL });
  const store = openCareStore();
  t.after(() => Promise.all([db.end(), store.close()]));
  let cancellations = false, creates = 0, sequence = 0, advance = 0;
  const sub = () => ({ id: "sub_keep", customer: "cus_keep", livemode: false,
    status: "active", cancel_at_period_end: cancellations });
  const stripe = {
    checkout: { sessions: {
      async create(args, options) {
        creates++;
        const id = args.client_reference_id;
        assert.equal(options.idempotencyKey, `sameday-care/${id}`);
        assert.equal(args.line_items[0].quantity, 1);
        assert.match(args.integration_identifier, /^sameday-care-[a-z]{8}$/);
        assert.equal(args.line_items[0].price_data.currency, "usd");
        const expected = id === recurring ? 10000 : 24900;
        assert.equal(args.line_items[0].price_data.unit_amount, expected);
        assert.equal(args.line_items[0].price_data.recurring?.interval, id === recurring ? "month" : undefined);
        assert.equal(new URL(args.success_url).search, "");
        assert.equal(new URL(args.success_url).hash.includes(careToken(secret, id, "intake")), true);
        const session = { id: `cs_test_${++sequence}`, livemode: false, mode: args.mode,
          client_reference_id: id, currency: "usd", amount_total: expected, metadata: args.metadata,
          status: "open", payment_status: "unpaid", url: "https://checkout.stripe.com/c/pay/cs_test_case" };
        provider.set(session.id, session);
        return session;
      },
      async retrieve(id) { assert.ok(provider.has(id)); return provider.get(id); },
    } },
    subscriptions: { async retrieve(id) { assert.equal(id, "sub_keep"); return sub(); } },
    billingPortal: { sessions: { async create(args) {
      assert.equal(args.customer, "cus_keep");
      assert.equal(args.configuration, "bpc_private");
      assert.equal(args.flow_data.subscription_cancel.subscription, "sub_keep");
      assert.match(args.return_url, /\/care\/subscription#/);
      return { livemode: false, url: "https://billing.stripe.com/p/session/test" };
    } } },
    invoicePayments: { async list({ payment }) {
      assert.deepEqual(payment, { type: "payment_intent", payment_intent: "pi_next" });
      return { data: [{ invoice: "in_next" }], has_more: false };
    } },
    invoices: { async retrieve(id) {
      assert.equal(id, "in_next");
      return { parent: { subscription_details: { subscription: "sub_keep" } } };
    } },
  };
  const care = createCareService({ store, stripe, live: false, secret, origin: "http://127.0.0.1:31861",
    portalConfiguration: "bpc_private", now: () => new Date(Date.now() + advance) });
  const server = createSdsApp({ care }).listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (action, body) => fetch(`${origin}/api/care/${action}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const event = (type, object, valid = true) => {
    const payload = JSON.stringify({ type, livemode: false, created: Math.floor(Date.now() / 1000), data: { object } });
    const signature = valid ? signingClient.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET }) : "invalid";
    return fetch(`${origin}/api/stripe/webhook`, {
      method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": signature }, body: payload,
    });
  };
  const access = (order, purpose = "intake") => ({ order, key: careToken(secret, order, purpose) });
  for (const page of ["/care/buy?offer=keep_it_working", "/care/intake", "/care/subscription"]) {
    const response = await fetch(origin + page);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.match(await response.text(), /<script[^>]+src="\/assets\//);
  }
  const start = (offer, order) => post("checkout", { offer, order });
  assert.equal((await start("agent_front_door", primary)).status, 200);
  assert.equal((await start("agent_front_door", primary)).status, 200);
  assert.equal(creates, 1);
  assert.equal((await start("keep_it_working", primary)).status, 409);
  const one = { ...provider.get("cs_test_1"), status: "complete", payment_status: "paid", payment_intent: "pi_primary",
    customer_details: { email: "one@example.test" } };
  assert.equal((await event("checkout.session.completed", one, false)).status, 400);
  assert.equal((await event("checkout.session.completed", { ...one, amount_total: 1 })).status, 500);
  assert.equal((await event("checkout.session.completed", { ...one, id: "cs_test_foreign" })).status, 500);
  assert.equal((await (await post("receipt", access(primary))).json()).state, "created");
  const intake = { surface: "A public MCP URL", outcome: "Tools list and return the declared outcome.", releaseChannel: "npm" };
  assert.equal((await post("intake", { ...access(primary), intake })).status, 409);
  assert.equal((await event("checkout.session.completed", one)).status, 200);
  assert.equal((await event("checkout.session.completed", one)).status, 200);
  assert.equal((await post("receipt", { order: recurring, key: access(primary).key })).status, 404);
  assert.equal((await post("intake", { ...access(primary), intake })).status, 200);
  assert.equal((await post("intake", { ...access(primary), intake })).status, 200);
  assert.equal((await post("intake", { ...access(primary), intake: { ...intake, surface: "Changed" } })).status, 409);
  assert.equal((await (await post("receipt", access(primary))).json()).amountCents, 24900);
  const refunded = { id: "ch_one", payment_intent: "pi_primary", refunded: true, amount_refunded: 24900, livemode: false };
  assert.equal((await event("charge.refunded", refunded)).status, 200);
  assert.equal((await event("checkout.session.completed", one)).status, 200);
  assert.equal((await (await post("receipt", access(primary))).json()).state, "refunded");

  assert.equal((await start("keep_it_working", recurring)).status, 200);
  const first = Math.floor(Date.now() / 1000), month = 30 * 86400;
  const invoice = { id: "in_initial", livemode: false, customer: "cus_keep", status: "paid", currency: "usd",
    amount_paid: 10000, billing_reason: "subscription_create",
    parent: { subscription_details: { subscription: "sub_keep", metadata: { sds_care_order: recurring } } },
    lines: { data: [{ amount: 10000, period: { start: first, end: first + month } }], has_more: false } };
  assert.equal((await event("invoice.paid", invoice)).status, 500);
  const two = { ...provider.get("cs_test_2"), status: "complete", payment_status: "paid", customer: "cus_keep",
    subscription: "sub_keep", customer_details: { email: "two@example.test" } };
  assert.equal((await event("checkout.session.completed", two)).status, 200);
  assert.equal((await event("invoice.paid", { ...invoice, amount_paid: 5000 })).status, 500);
  assert.equal((await event("invoice.paid", invoice)).status, 200);
  assert.equal((await event("invoice.paid", invoice)).status, 200);
  assert.equal((await post("subscription", access(recurring))).status, 404);
  assert.match((await (await post("subscription", access(recurring, "cancel"))).json()).url, /^https:\/\/billing.stripe.com/);
  cancellations = true;
  advance = 1000;
  assert.equal((await event("customer.subscription.updated", sub())).status, 200);
  assert.equal((await event("customer.subscription.updated", sub())).status, 200);
  assert.equal((await (await post("subscription", access(recurring, "cancel"))).json()).canceled, true);
  assert.equal((await (await post("receipt", access(recurring))).json()).subscription.cancelAtPeriodEnd, true);
  assert.equal((await event("charge.refunded", { ...refunded, customer: "cus_keep", payment_intent: "pi_next", amount_refunded: 10000 })).status, 200);
  const next = { ...invoice, id: "in_next", billing_reason: "subscription_cycle",
    lines: { data: [{ amount: 10000, period: { start: first + month, end: first + month * 2 } }] } };
  assert.equal((await event("invoice.paid", next)).status, 200);
  assert.deepEqual((await db.query("select invoice_id,status from public.care_periods order by period_start")).rows,
    [{ invoice_id: "in_initial", status: "ready" }, { invoice_id: "in_next", status: "review" }]);
  assert.equal((await start("agent_front_door", expiring)).status, 200);
  provider.get("cs_test_3").status = "expired";
  const expired = await start("agent_front_door", expiring);
  assert.equal(expired.status, 409);
  assert.equal((await expired.json()).code, "checkout_expired");
  const mail = () => drainCareMail({ store, secret, from: FROM, replyTo: "contact@samedaydesk.com",
    send: (...args) => resend.emails.send(...args) });
  assert.deepEqual(await mail(), { accepted: 4, deferred: 0 });
  assert.deepEqual(await mail(), { accepted: 0, deferred: 0 });
  const messages = (await readFile(process.env.SDS_PREVIEW_MAIL_OUTBOX, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(messages.length, 4);
  assert.ok(messages.every((message) => message.from.includes("@samedaydesk.com") && message.replyTo === "contact@samedaydesk.com"));
  assert.ok(messages.find((message) => message.to === "two@example.test" && message.subject.endsWith("receipt")).text.includes(access(recurring, "cancel").key));
});
