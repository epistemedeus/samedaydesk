import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { setTimeout as wait } from "node:timers/promises";
import pg from "pg";
import { createSdsApp } from "../app.js";
import { createCareService } from "../lib/care-service.js";
import { careTable } from "../lib/care-database.js";
import { openCareStore } from "../lib/care-store.js";
import { careToken } from "../lib/care-contract.js";
import { drainCareMail } from "../lib/care-mail.js";
import { githubSentinel, sentinelReportArtifacts, sentinelReportingChecks, tickSentinel } from "../lib/care-sentinel.js";
import { FROM, resend } from "../lib/resend.js";
import { stripe as signingClient } from "../lib/stripe.js";

const nativeActions = process.env.SDS_PRIVATE_NATIVE_SENTINEL === "1";
if (nativeActions && (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_EVENT_NAME !== "push" ||
    process.env.GITHUB_REPOSITORY !== "epistemedeus/samedaydesk" || process.env.GITHUB_REF_NAME !== "grand-phase/redo" ||
    !/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA ?? "") || process.env.SDS_PRIVATE_PREVIEW !== "1" ||
    !process.env.SDS_PRIVATE_ACTIONS_TOKEN)) throw new Error("Native Sentinel canary is only allowed on its private release branch runner");

test("built HTTP preview and real PostgreSQL receive both checkouts, money authority and branded delivery",
  { timeout: nativeActions ? 16 * 60_000 : 90_000 }, async (t) => {
  const secret = "isolated care access secret sufficient length";
  const primary = randomUUID(), recurring = randomUUID(), expiring = randomUUID();
  const route = randomUUID(), shop = randomUUID();
  const provider = new Map();
  const db = new pg.Pool({ connectionString: process.env.SDS_CARE_DATABASE_URL });
  const store = openCareStore();
  t.after(() => Promise.all([db.end(), store.close()]));
  let cancellations = false, cancelAt = null, creates = 0, sequence = 0, advance = 0;
  let quotePrice, quoteLink, quoteWrites = 0, priceWrites = 0;
  const sub = () => ({ id: "sub_keep", customer: "cus_keep", livemode: false,
    status: "active", cancel_at_period_end: cancellations, cancel_at: cancelAt });
  const stripe = {
    checkout: { sessions: {
      async create(args, options) {
        creates++;
        const id = args.client_reference_id;
        assert.equal(options.idempotencyKey, `sameday-care/${id}`);
        assert.equal(args.line_items[0].quantity, 1);
        assert.match(args.integration_identifier, /^sameday-care-[a-z]{8}$/);
        assert.equal(args.line_items[0].price_data.currency, "usd");
        const expected = id === recurring ? 10000 : id === route ? 49900 : id === shop ? 99900 : 24900;
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
    paymentIntents: { async retrieve(id) {
      if (id === "pi_quote") return { id, amount: 12300, currency: "usd", livemode: false, metadata: quoteLink.metadata };
      assert.ok(["pi_primary", "pi_next"].includes(id));
      return { id, livemode: false, metadata: {} };
    } },
    prices: { async create(args, options) {
      priceWrites++;
      assert.ok(options.idempotencyKey.startsWith("sds-task-price/"));
      assert.equal(args.unit_amount, 12300);
      quotePrice = { id: "price_task", livemode: false, ...args };
      return quotePrice;
    } },
    paymentLinks: {
      async create(args, options) {
        quoteWrites++;
        assert.ok(options.idempotencyKey.startsWith("sds-task-link/"));
        assert.equal(args.restrictions.completed_sessions.limit, 1);
        assert.deepEqual(args.line_items, [{ price: quotePrice.id, quantity: 1 }]);
        quoteLink = { id: "plink_task", active: true, livemode: false, url: "https://buy.stripe.com/test_private", metadata: args.metadata };
        return quoteLink;
      },
      async retrieve(id) { assert.equal(id, quoteLink.id); return quoteLink; },
    },
  };
  const care = createCareService({ store, stripe, live: false, secret, origin: "http://127.0.0.1:31861",
    portalConfiguration: "bpc_private", now: () => new Date(Date.now() + advance) });
  const server = createSdsApp({ care }).listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const visit = await fetch(origin + "/?utm_source=release", { headers: { Referer: "https://example.test/private?email=private" } });
  assert.equal(visit.status, 200);
  const cookie = visit.headers.get("set-cookie").split(";", 1)[0];
  const journeySession = cookie.split("=")[1];
  const seller = (query = "") => fetch(origin + "/api/checkout/seller-conformance" + query, { redirect: "manual" });
  assert.equal((await seller()).status, 503);
  process.env.SDS_TEST_SELLER_CONFORMANCE_LINK = "https://buy.stripe.com/7sY00keoqbLN899282eZ20F";
  assert.equal((await seller()).status, 503); // A live link cannot slip into preview.
  process.env.SDS_TEST_SELLER_CONFORMANCE_LINK = "https://buy.stripe.com/test_preview";
  const sale = await seller("?finding=hypernatt-liq-radar-20260830");
  assert.equal(sale.status, 303);
  assert.equal(sale.headers.get("location"), "https://buy.stripe.com/test_preview?client_reference_id=hypernatt-liq-radar-20260830");
  assert.equal((await seller("?finding=https%3A%2F%2Fexample.test")).headers.get("location"), "https://buy.stripe.com/test_preview");
  delete process.env.SDS_TEST_SELLER_CONFORMANCE_LINK;
  const post = (action, body) => fetch(`${origin}/api/care/${action}`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body),
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
  assert.equal((await db.query(`select count(*)::int as n from ${careTable("journey_events")} where event='payment_verified'`)).rows[0].n, 0,
    "invalid signatures and mismatched payments must not write payment observations");
  const intake = { surface: "A public MCP URL", outcome: "Tools list and return the declared outcome.", releaseChannel: "npm" };
  assert.equal((await post("intake", { ...access(primary), intake })).status, 409);
  assert.equal((await event("checkout.session.completed", one)).status, 200);
  assert.equal((await event("checkout.session.completed", one)).status, 200);
  assert.equal((await db.query(`select count(*)::int as n from ${careTable("journey_events")} where event='payment_verified' and order_id=$1`, [primary])).rows[0].n, 1);
  assert.equal((await db.query(`select session_id from ${careTable("journey_events")} where event='payment_verified' and order_id=$1`, [primary])).rows[0].session_id, journeySession);
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
  assert.equal((await db.query(`select count(*)::int as n from ${careTable("care_periods")}`)).rows[0].n, 0);
  const two = { ...provider.get("cs_test_2"), status: "complete", payment_status: "paid", customer: "cus_keep",
    subscription: "sub_keep", customer_details: { email: "two@example.test" } };
  provider.set(two.id, two);
  assert.equal((await event("invoice.paid", { ...invoice, customer: "cus_foreign" })).status, 500);
  assert.equal((await event("invoice.paid", invoice)).status, 200);
  assert.equal((await store.order(recurring)).state, "paid");
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
  cancellations = false;
  cancelAt = first + month;
  assert.equal((await event("customer.subscription.updated", sub())).status, 200);
  assert.equal((await (await post("subscription", access(recurring, "cancel"))).json()).canceled, true);
  assert.equal((await (await post("receipt", access(recurring))).json()).subscription.cancelAtPeriodEnd, true);
  assert.equal((await event("charge.refunded", { ...refunded, customer: "cus_keep", payment_intent: "pi_next", amount_refunded: 10000 })).status, 200);
  const next = { ...invoice, id: "in_next", billing_reason: "subscription_cycle",
    lines: { data: [{ amount: 10000, period: { start: first + month, end: first + month * 2 } }] } };
  assert.equal((await event("invoice.paid", next)).status, 200);
  assert.deepEqual((await db.query(`select invoice_id,status from ${careTable("care_periods")} order by period_start`)).rows,
    [{ invoice_id: "in_initial", status: "ready" }, { invoice_id: "in_next", status: "review" }]);
  assert.equal((await start("agent_front_door", expiring)).status, 200);
  provider.get("cs_test_3").status = "expired";
  const expired = await start("agent_front_door", expiring);
  assert.equal(expired.status, 409);
  assert.equal((await expired.json()).code, "checkout_expired");
  assert.equal((await start("machine_payment_route", route)).status, 200);
  assert.equal((await start("agent_storefront", shop)).status, 200);
  assert.equal((await store.order(route)).amount_cents, 49900);
  assert.equal((await store.order(shop)).amount_cents, 99900);

  let runs = [], dispatches = 0, jobReads = 0, evidenceReady = false, expectedTitle, lastIdentity;
  const head = "a".repeat(40);
  const fakeArtifacts = ["windows-latest", "macos-latest", "ubuntu-24.04"].map((os) => ({
    name: `release-check-report-${os}-attempt-1`, expired: false, size_in_bytes: 100,
    workflow_run: { id: 4123, head_sha: head },
  }));
  const fixtureGateway = {
    branch: "grand-phase/redo",
    async dispatch(period) {
      dispatches++;
      assert.equal(period.package_spec, "sentinel-ir-mcp@0.5.13");
      assert.deepEqual(Object.keys(period).filter((key) => ["email", "intake"].includes(key)), []);
      runs = [{ id: 4123, event: "workflow_dispatch", head_branch: this.branch, head_sha: head, status: "in_progress",
        display_title: `Keep it working ${period.task_ref}`, created_at: new Date().toISOString(), run_attempt: 1 }];
      throw new Error("lost response after provider admitted the run");
    },
    async runs() { return [{ ...runs[0], id: 4124, head_branch: "main" }, ...runs]; },
    async run(id) { assert.equal(id, 4123); return runs[0]; },
    async jobs(id, attempt) {
      jobReads++;
      assert.equal(id, 4123);
      assert.equal(attempt, 1);
      return ["windows-latest", "macos-latest", "ubuntu-24.04"].map((os) => ({
        name: `release-check (${os})`, status: "completed",
        steps: [{ name: "Release check", conclusion: os === "macos-latest" ? "failure" : "success" }],
      }));
    },
    async artifacts(id) {
      assert.equal(id, 4123);
      return evidenceReady ? fakeArtifacts : fakeArtifacts.slice(0, 2);
    },
  };
  const realGateway = nativeActions ? githubSentinel({
    token: process.env.SDS_PRIVATE_ACTIONS_TOKEN, branch: process.env.GITHUB_REF_NAME,
  }) : null;
  const github = realGateway ? {
    ...realGateway,
    async dispatch(period) {
      dispatches++;
      assert.equal(period.package_spec, "sentinel-ir-mcp@0.5.13");
      assert.deepEqual(Object.keys(period).filter((key) => ["email", "intake"].includes(key)), []);
      expectedTitle = `Keep it working ${period.task_ref}`;
      return realGateway.dispatch(period);
    },
    async run(id) {
      const row = await realGateway.run(id);
      const identity = JSON.stringify({ event: row.event === "workflow_dispatch",
        branch: row.head_branch === process.env.GITHUB_REF_NAME, source: row.head_sha === process.env.GITHUB_SHA,
        title: row.display_title === expectedTitle, terminal: row.status === "completed" });
      if (identity !== lastIdentity) console.log(`SDS_SENTINEL_PROVIDER_READ ${identity}`);
      lastIdentity = identity;
      return row;
    },
    async jobs(id, attempt) {
      const run = await realGateway.run(id);
      assert.equal(run.head_sha, process.env.GITHUB_SHA, "child must run the reviewed candidate revision");
      assert.equal(run.event, "workflow_dispatch");
      jobReads++;
      return realGateway.jobs(id, attempt);
    },
  } : fixtureGateway;
  const tick = () => tickSentinel({ store, github, orderId: recurring, spec: "sentinel-ir-mcp@0.5.13" });
  assert.equal(await tick(), "nothing_due"); // Paid, but scope has not been received.
  assert.equal((await post("intake", { ...access(recurring), intake })).status, 200);
  const concurrent = await Promise.all([tick(), tick()]);
  let actualRunId;
  if (realGateway) {
    assert.ok(concurrent.some((state) => ["submitted", "dispatch_needs_readback"].includes(state)));
    const deadline = Date.now() + 14 * 60_000;
    let state;
    do {
      state = await tick();
      if (state === "reported") break;
      assert.ok(["running", "awaiting_run", "report_needs_review"].includes(state), `Unexpected worker state: ${state}`);
      await wait(8000, undefined, { signal: t.signal });
    } while (Date.now() < deadline);
    assert.equal(state, "reported", "native run and three attempt-matched report artifacts must be received");
    actualRunId = Number((await db.query(
      `select run_id from ${careTable("care_periods")} where order_id = $1 and invoice_id = 'in_initial'`, [recurring],
    )).rows[0].run_id);
    assert.ok(Number.isSafeInteger(actualRunId) && actualRunId > 0);
  } else {
    assert.ok(concurrent.includes("dispatch_needs_readback"));
    assert.equal(await tick(), "running"); // Reconcile the exact run without another POST.
    assert.equal(jobReads, 0);
    const title = runs[0].display_title;
    runs[0].display_title = "Keep it working release check";
    assert.equal(await tick(), "awaiting_run");
    runs[0].display_title = `Keep it working ${randomUUID()}`;
    assert.equal(await tick(), "run_mismatch");
    runs[0].display_title = title;
    assert.equal(jobReads, 0);
    runs[0].status = "completed";
    assert.equal(await tick(), "report_needs_review"); // An incomplete artifact set cannot send a report.
    evidenceReady = true;
    assert.equal(await tick(), "reported");
    assert.equal(jobReads, 2);
  }
  assert.equal(await tick(), "nothing_due");
  assert.equal(dispatches, 1);
  assert.equal(sentinelReportingChecks([{ name: "release-check (ubuntu-24.04)" }]), null);
  const artifactRun = { id: 4123, run_attempt: 1, head_sha: head };
  assert.equal(sentinelReportArtifacts(fakeArtifacts, artifactRun), true);
  assert.equal(sentinelReportArtifacts(fakeArtifacts, { ...artifactRun, run_attempt: 2 }), false);
  assert.equal(sentinelReportArtifacts(fakeArtifacts.concat(fakeArtifacts[0]), artifactRun), false);
  assert.deepEqual((await db.query(`select invoice_id,status from ${careTable("care_periods")} order by period_start`)).rows,
    [{ invoice_id: "in_initial", status: "reported" }, { invoice_id: "in_next", status: "review" }]);

  const mail = () => drainCareMail({ store, secret, from: FROM, replyTo: "contact@samedaydesk.com",
    send: (...args) => resend.emails.send(...args) });
  assert.deepEqual(await mail(), { accepted: 6, deferred: 0 });
  assert.deepEqual(await mail(), { accepted: 0, deferred: 0 });
  const messages = (await readFile(process.env.SDS_PREVIEW_MAIL_OUTBOX, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(messages.length, 6);
  assert.ok(messages.every((message) => message.from.includes("@samedaydesk.com") && message.replyTo === "contact@samedaydesk.com"));
  assert.ok(messages.find((message) => message.to === "two@example.test" && message.subject.endsWith("receipt")).text.includes(access(recurring, "cancel").key));
  const reports = messages.filter((message) => message.subject === "Your monthly Keep it working report");
  assert.equal(reports.length, 1);
  const [report] = reports;
  assert.match(report.text, /Windows: Passed\./);
  assert.match(report.text, nativeActions ? /macOS: Passed\./ : /macOS: Needs attention\./);
  assert.match(report.text, /Linux: Passed\./);
  if (actualRunId) {
    console.log(`SDS_SENTINEL_CLOSED_LOOP run=${actualRunId} dispatches=${dispatches} paidScope=true systems=3 outboxReports=1`);
  }

  const intakeResponse = await fetch(`${origin}/api/requests`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "task@example.test", task: "Check both clients and reproduce the stated failure." }),
  });
  assert.equal(intakeResponse.status, 201);
  const requestId = (await db.query(`select id from ${careTable("task_requests")} where email='task@example.test'`)).rows[0].id;
  assert.equal((await intakeResponse.json()).reference, `SDD-${requestId.slice(0, 8).toUpperCase()}`);
  const terms = { amountCents: 12300, scope: "Check both generated client configurations.", acceptance: "Both clients complete a tool list call." };
  const offer = await care.issueQuote(requestId, terms);
  assert.equal(offer.to, "task@example.test");
  assert.equal(offer.amountCents, 12300);
  assert.deepEqual(await care.issueQuote(requestId, terms), offer);
  await assert.rejects(() => care.issueQuote(requestId, { ...terms, amountCents: 12400 }), { status: 409 });
  assert.equal(quoteWrites, 1);
  assert.equal(priceWrites, 1);
  const paidQuote = { id: "cs_test_paid_quote", livemode: false, mode: "payment", currency: "usd",
    payment_link: quoteLink.id, status: "complete", payment_status: "paid", amount_total: 12300,
    customer_details: { email: "task@example.test" }, payment_intent: "pi_quote", metadata: quoteLink.metadata };
  assert.equal((await event("checkout.session.completed", { ...paidQuote, payment_link: "plink_wrong" })).status, 500);
  assert.equal((await event("checkout.session.completed", paidQuote)).status, 200);
  assert.equal((await event("checkout.session.completed", paidQuote)).status, 200);
  assert.equal((await db.query(`select status from ${careTable("task_requests")} where id=$1`, [requestId])).rows[0].status, "paid");
  assert.equal((await event("charge.refunded", { id: "ch_quote", payment_intent: "pi_quote" })).status, 200);
  assert.equal((await store.quotes.order(offer.quoteId)).needs_review, true);

  // Hosted work without an account must survive notification loss and webhook replay.
  const hostedSession = { id: "cs_test_hosted", livemode: false, mode: "payment", currency: "usd",
    status: "complete", payment_status: "paid", amount_total: 49000, payment_intent: "pi_hosted",
    metadata: { offer: "seller_contract_repair", label: "One-route seller contract repair" } };
  const hostedIntent = { id: "pi_hosted", livemode: false, status: "succeeded", amount: 49000, currency: "usd" };
  await assert.rejects(() => care.recordHosted({ ...hostedSession, amount_total: 1 }, hostedIntent), { status: 409 });
  await assert.rejects(() => care.recordHosted({ ...hostedSession, amount_total: 1 }, { ...hostedIntent, amount: 1 }), { status: 409 });
  await assert.rejects(() => care.recordHosted(hostedSession, { ...hostedIntent, status: "processing" }), { status: 409 });
  assert.equal((await care.recordHosted(hostedSession, hostedIntent)).isNew, true);
  assert.equal((await care.recordHosted(hostedSession, hostedIntent)).isNew, false);
  assert.equal((await db.query("select count(*)::int as n from hosted_orders where payment_intent_id='pi_hosted'")).rows[0].n, 1);
  assert.equal(await store.hostedRefund("pi_hosted", 49000, true), true);
  assert.equal((await db.query("select state from hosted_orders where payment_intent_id='pi_hosted'")).rows[0].state, "refunded");
  stripe.charges = { async retrieve(id) {
    assert.equal(id, "ch_hosted");
    return { livemode: false, payment_intent: "pi_hosted", refunded: true, amount_refunded: 49000 };
  } };
  assert.equal((await care.recordHosted(hostedSession, { ...hostedIntent, latest_charge: "ch_hosted" })).held, true);

  // A later paid order from the same verified buyer is a return, even when the
  // older order was refunded. A replay still contributes only one observation.
  const returning = randomUUID();
  await care.start("agent_front_door", returning, journeySession);
  const returningOrder = await store.order(returning);
  const returningSession = { ...provider.get(returningOrder.session_id), status: "complete", payment_status: "paid",
    payment_intent: "pi_return", customer_details: { email: "one@example.test" } };
  assert.equal((await event("checkout.session.completed", returningSession)).status, 200);
  assert.equal((await event("checkout.session.completed", returningSession)).status, 200);
  const rows = (await db.query(`select event,brand,test,session_id,order_id,referrer,utm from ${careTable("journey_events")} order by event`)).rows;
  assert.deepEqual([...new Set(rows.map(row => row.event))], ["checkout_started", "payment_verified", "receipt_sent", "return", "visit"]);
  assert.ok(rows.every(row => row.brand === "samedaydesk" && row.test === true));
  assert.equal(rows.filter(row => row.event === "return" && row.order_id === returning).length, 1);
  const firstVisit = rows.find(row => row.event === "visit" && row.session_id === journeySession);
  assert.equal(firstVisit.referrer, "https://example.test");
  assert.deepEqual(firstVisit.utm, { utm_source: "release" });
  console.log("COMMERCE_JOURNEY_OK " + JSON.stringify({ events: [...new Set(rows.map(row => row.event))],
    allTest: true, invalidPaymentRejected: true, replayDeduplicated: true, buyerFieldsExcluded: true }));

  const mailKey = randomBytes(32), mailId = "msg_" + randomUUID(), emailId = randomUUID();
  process.env.RESEND_WEBHOOK_SECRET = "whsec_" + mailKey.toString("base64");
  const mailPayload = JSON.stringify({ type: "email.bounced", data: { email_id: emailId, to: ["bounced@resend.dev"] } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", mailKey).update(`${mailId}.${timestamp}.${mailPayload}`).digest("base64");
  const mailEvent = (valid) => fetch(origin + "/api/webhooks/resend", { method: "POST", body: mailPayload,
    headers: { "Content-Type": "application/json", "svix-id": mailId, "svix-timestamp": timestamp,
      "svix-signature": "v1," + (valid ? signature : "invalid") } });
  assert.equal((await mailEvent(false)).status, 400);
  assert.equal((await db.query(`select count(*)::int as n from ${careTable("mail_events")} `)).rows[0].n, 0);
  assert.equal((await mailEvent(true)).status, 200);
  assert.equal((await mailEvent(true)).status, 200);
  const mailRows = (await db.query(`select event_id,email_id,event_type,test from ${careTable("mail_events")} `)).rows;
  assert.deepEqual(mailRows, [{ event_id: mailId, email_id: emailId, event_type: "email.bounced", test: true }]);
  console.log("MAIL_BOUNCE_STORAGE_OK signed synthetic bounce stored once; invalid signature refused");
});
