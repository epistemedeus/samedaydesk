// SameDayDesk's side of scripts/release/stripe-matrix.mjs: the care checkout (one-time services and
// the Keep it working subscription) on the built Node app, with a throwaway local PostgreSQL for
// care_orders and the private preview mail outbox (no mail leaves the machine).
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, lstatSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pg, dsn, server, scratch, accessSecret, careLink;
let nextQuote;

async function prepareQuote(ctx) {
  if (nextQuote) return nextQuote;
  const response = await fetch(ctx.preview + "/api/requests", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ctx.buyerEmail, task: "Verify the release client's documented tool-list workflow." }) });
  if (response.status !== 201) throw new Error("The real task request was not accepted");
  const requestId = psql(`select id from task_requests where email='${ctx.buyerEmail.toLowerCase()}' order by created_at desc limit 1`);
  const { openCareStore } = await import(pathToFileURL(join(ctx.root, "server/lib/care-store.js")).href);
  const { createTaskQuoteService } = await import(pathToFileURL(join(ctx.root, "server/lib/task-quotes.js")).href);
  const { default: Stripe } = await import("stripe");
  const client = new Stripe(ctx.key, { apiVersion: "2026-11-18.endive", maxNetworkRetries: 0 });
  // Test objects carry the run tag without changing the production quote service.
  const tagged = (method) => (args, options) => method({ ...args, metadata: { ...args.metadata, release_run: ctx.run },
    ...(args.payment_intent_data ? { payment_intent_data: { ...args.payment_intent_data,
      metadata: { ...args.payment_intent_data.metadata, release_run: ctx.run } } } : {}) }, options);
  const stripe = { prices: { create: tagged(client.prices.create.bind(client.prices)) },
    paymentLinks: { create: tagged(client.paymentLinks.create.bind(client.paymentLinks)), retrieve: client.paymentLinks.retrieve.bind(client.paymentLinks) } };
  const store = openCareStore({ SDS_PRIVATE_PREVIEW: "1", SDS_CARE_DATABASE_URL: dsn });
  try {
    const quote = await createTaskQuoteService({ store: store.quotes, stripe, live: false }).issue(requestId, {
      amountCents: 12300, scope: "Verify the generated client's documented tool-list workflow.",
      acceptance: "The generated client completes one documented tool-list call." });
    nextQuote = { ...quote, linkId: psql(`select stripe_link from task_quotes where id='${quote.quoteId}'`) };
    return nextQuote;
  } finally { await store.close(); }
}

function psql(sql) {
  return execFileSync("psql", ["-X", "-At", "-v", "ON_ERROR_STOP=1", dsn, "-c", sql], { encoding: "utf8" }).trim();
}

export async function start(ctx) {
  const { root, port, key, webhookSecret, run } = ctx;
  if (!existsSync(join(root, "client/dist/index.html"))) execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
  scratch = mkdtempSync(join(os.tmpdir(), "sds-stripe-"));
  accessSecret = randomBytes(32).toString("hex");
  ({ careLink } = await import(pathToFileURL(join(root, "server/lib/care-contract.js")).href));
  pg = execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
  const pgPort = 55491;
  execFileSync(join(pg, "initdb"), ["-A", "trust", "-D", join(scratch, "data")], { stdio: "ignore" });
  execFileSync(join(pg, "pg_ctl"), ["-D", join(scratch, "data"), "-l", join(scratch, "pg.log"), "-o", `-F -p ${pgPort} -k ${scratch} -c listen_addresses=''`, "-w", "start"], { stdio: "ignore" });
  dsn = `postgresql://${os.userInfo().username}@127.0.0.1/postgres?host=${encodeURIComponent(scratch)}&port=${pgPort}`;
  for (const m of ["0011_task_requests.sql", "0012_care_orders.sql", "0013_task_quotes.sql", "0014_commerce_journey.sql", "0015_mail_events.sql"]) {
    execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", dsn, "-f", join(root, "supabase/migrations", m)], { stdio: "ignore" });
  }
  const portal = await ctx.stripe("POST", "billing_portal/configurations", {
    "business_profile[headline]": "Manage your SameDayDesk subscription",
    "features[subscription_cancel][enabled]": "true",
    "features[subscription_cancel][mode]": "at_period_end",
    "metadata[release_run]": run,
  });
  server = spawn(process.execPath, [ctx.clockCustomer ? "scripts/release/clock-preview.mjs" : "server/index.js"], {
    cwd: root, stdio: ["ignore", "pipe", "pipe"],
    env: {
      PATH: process.env.PATH, HOME: scratch, NODE_ENV: "production", PORT: String(port),
      SDS_PRIVATE_PREVIEW: "1", SDS_CARE_CHECKOUT: "1", SDS_CARE_DATABASE_URL: dsn,
      SDS_CARE_ORIGIN: `http://127.0.0.1:${port}`, SDS_CARE_ACCESS_SECRET: accessSecret,
      STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: webhookSecret, RELEASE_RUN: run,
      GITHUB_SHA: ctx.source,
      SDS_CARE_PORTAL_CONFIGURATION: portal.id, RELEASE_CLOCK_CUSTOMER: ctx.clockCustomer,
      SDS_PREVIEW_MAIL_OUTBOX: join(scratch, "outbox.jsonl"), ADMIN_EMAIL: "desk@example.test",
      SDS_RECEIPTS_SNAPSHOT_PATH: join(scratch, "receipt-snapshot.json"),
    },
  });
  let log = "";
  server.stdout.on("data", (c) => { log = (log + c).slice(-4000); });
  server.stderr.on("data", (c) => { log = (log + c).slice(-4000); });
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    if (server.exitCode !== null) break;
    if (await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.ok, () => false)) {
      return { stop: () => stop() };
    }
  }
  console.error(log);
  await stop();
  throw new Error("SameDayDesk preview did not start");
}

async function stop() {
  server?.kill("SIGTERM");
  if (scratch) {
    spawnSync(join(pg, "pg_ctl"), ["-D", join(scratch, "data"), "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
    rmSync(scratch, { recursive: true, force: true });
  }
}

// The price the buy page shows on its pay button.
export async function shownPrice(ctx, offer, page) {
  if (offer.kind === "quote") {
    const q = await prepareQuote(ctx);
    return { page: "operator-issued written quote", label: `${q.scope} ${q.amountCents / 100} USD`, cents: q.amountCents, acceptance: q.acceptance };
  }
  await page.goto(`${ctx.preview}${offer.entry}`, { waitUntil: "networkidle2" });
  const text = await page.$$eval("button", (bs) => bs.map((b) => b.textContent).join("\n"));
  const m = text.match(/Continue to pay ([\d,]+(?:\.\d\d)?) USD/);
  const cents = m ? Math.round(Number(m[1].replace(/,/g, "")) * 100) : null;
  return { page: offer.entry, label: m?.[0] ?? null, cents };
}

// The same call the buy page makes. `again` repeats it for the same order (a lost response).
export async function open(ctx, offer, { again, page } = {}) {
  if (offer.kind === "quote") {
    const q = await prepareQuote(ctx); nextQuote = null;
    await page.goto(q.url, { waitUntil: "networkidle2", timeout: 60000 });
    const sessions = await ctx.stripe("GET", "checkout/sessions", { payment_link: q.linkId, limit: "2" });
    const own = sessions.data.filter(s => s.metadata?.sds_task_quote === q.quoteId && s.metadata?.release_run === ctx.run);
    if (own.length !== 1) throw new Error("One actual hosted session for the exact quote link is required");
    return { kind: "quote", order: q.quoteId, requestId: q.requestId, sessionId: own[0].id, url: null };
  }
  const order = again?.order ?? randomUUID();
  const res = await fetch(`${ctx.preview}/api/care/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offer: offer.offer, order }) });
  const body = await res.json();
  if (!res.ok || !body.url) throw new Error(`checkout answered ${res.status}: ${body.error ?? "no url"}`);
  const sessionId = psql(`select session_id from care_orders where id = '${order}'`);
  return { order, url: body.url, sessionId };
}

export async function storedRow(_ctx, a) {
  if (a.kind === "quote") return JSON.parse(psql(`select row_to_json(o) from (select q.id,q.amount_cents,q.live_mode,
    q.stripe_session as session_id,q.payment_intent is not null as has_payment,q.needs_review,
    r.status as request_state,case when q.paid_at is not null and not q.needs_review and r.status='paid' then 'paid' else 'created' end as state
    from task_quotes q join task_requests r on r.id=q.request_id where q.id='${a.order}') o`));
  const row = psql(`select row_to_json(o) from (select id, offer, amount_cents, live_mode, state, session_id, payment_intent_id is not null as has_payment, subscription_id is not null as has_subscription, subscription_status, cancel_at_period_end, refunded_cents from care_orders where id = '${a.order}') o`);
  return row ? JSON.parse(row) : null;
}
export async function orderCount(_ctx, a) {
  return Number(psql(`select count(*) from care_orders where session_id = '${a.sessionId}'`));
}
export const isPaid = (row) => row?.state === "paid";
export const paymentFailureMatches = (a, intent) => intent.metadata?.sds_care_order === a.order;
export const isExpired = (row) => row?.state === "expired";
export const isRefunded = (row) => row?.state === "refunded" && row.refunded_cents === row.amount_cents;
export const describe = (row) => row ? `${row.state}, refunded ${row.refunded_cents}` : "no row";
export const comparable = (row) => row && { state: row.state, session_id: row.session_id, refunded_cents: row.refunded_cents, has_payment: row.has_payment };

export function receiptMail(ctx, a) {
  const file = process.env.SDS_RELEASE_RESEND_FILE;
  const stat = file && lstatSync(file);
  if (!stat?.isFile() || (stat.mode & 0o077) || stat.uid !== process.getuid()) throw new Error("An existing private Resend input is required");
  const config = JSON.parse(readFileSync(file, "utf8"));
  if (!config.RESEND_API_KEY || !config.RESEND_FROM_EMAIL) throw new Error("The existing Resend input is incomplete");
  const result = spawnSync(process.execPath, ["scripts/release/receipt-preview.mjs", a.order], {
    cwd: ctx.root, encoding: "utf8", timeout: 30000,
    env: { PATH: process.env.PATH, HOME: scratch, NODE_ENV: "production", SDS_PRIVATE_PREVIEW: "1",
      SDS_CARE_DATABASE_URL: dsn, SDS_CARE_ACCESS_SECRET: accessSecret, SDS_PREVIEW_RESEND: "1",
      RESEND_API_KEY: config.RESEND_API_KEY, RESEND_FROM_EMAIL: config.RESEND_FROM_EMAIL,
      RELEASE_RUN: ctx.run },
  });
  if (result.status !== 0) throw new Error("The restricted receipt child did not confirm delivery");
  const mail = JSON.parse(result.stdout.trim());
  mail.stored = JSON.parse(psql(`select row_to_json(m) from (select kind,accepted_at,provider_id from care_mail where order_id='${a.order}' and kind='receipt') m`));
  return mail;
}

export function periods(_ctx, a) {
  return JSON.parse(psql(`select coalesce(json_agg(p order by period_start),'[]') from
    (select invoice_id,period_start,period_end,status from care_periods where order_id='${a.order}') p`));
}
export const cancellationLink = (ctx, a) => careLink({ id: a.order, checkout_origin: ctx.preview }, accessSecret, "cancel");

// The buyer's receipt page, reached by the success URL (its capability key stays in the fragment).
export async function buyerScreen(ctx, a, page, name) {
  if (a.kind === "quote") {
    const text = await page.evaluate(() => document.body.innerText);
    const file = join(ctx.out, `${name}.png`); await page.screenshot({ path: file });
    return { url: page.url().replace(/[?#].*/, "?<redacted>"), screenshot: file.slice(ctx.root.length + 1),
      text: text.slice(0, 1200), ok: /Payment received/i.test(text) };
  }
  const link = careLink({ id: a.order, checkout_origin: ctx.preview }, accessSecret);
  await page.goto(link, { waitUntil: "networkidle2" });
  await sleep(1500);
  const file = join(ctx.out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  const text = await page.evaluate(() => document.querySelector("main")?.innerText ?? document.body.innerText).catch(() => "");
  return {
    url: page.url().replace(/#.*/, "#<capability>"),
    screenshot: file.slice(ctx.root.length + 1),
    text: text.slice(0, 800),
    ok: /Paid: [\d,.]+ USD/.test(text) || /Payment refunded/.test(text) || /expired/i.test(text),
    showsRefund: /Payment refunded/.test(text),
  };
}
