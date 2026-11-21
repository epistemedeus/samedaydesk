#!/usr/bin/env node
// npm run release:stripe -- [--offers id,id] [--cases success,expire,replay,refund] [--lane SDS] [--headed]
//
// The money matrix of the pass bar (16 §3 C) in Stripe TEST mode, against the private preview.
// release/offers.json lists every priced offer with its checkout entry and shown price;
// scripts/release/stripe-adapter.mjs knows how this repository starts its preview, opens a checkout,
// reads its stored row and shows the buyer's screen.
//
// Cases: readback (session matches the shown price), success (hosted 4242), decline, block,
// 3ds-pass, 3ds-fail, expire (abandoned: the session expires), replay (the same signed event again:
// still one order), lost-response (the checkout call repeated after a lost response: one session,
// one order), refund (the buyer page shows it). Each case writes four records to
// release/out/stripe/<run>/<offer>-<case>.json: what the buyer saw, the Stripe object read back,
// the Stripe-sent webhook (through `stripe listen`), and the stored row.
//
// Every session carries metadata.release_run = <run>; this harness reads only its own run's
// objects, and the preview's receiver ignores events tagged with another run.
// The key comes from STRIPE_TEST_KEY or STRIPE_TEST_KEY_FILE and must be a test key (sk_test or
// rk_test); anything else stops before any call. Never prints the key.
import { createHmac, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const args = process.argv.slice(2);
const value = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const config = JSON.parse(readFileSync(join(root, "release/offers.json"), "utf8"));
const adapter = await import(pathToFileURL(join(here, "stripe-adapter.mjs")).href);

const key = (process.env.STRIPE_TEST_KEY || (process.env.STRIPE_TEST_KEY_FILE ? readFileSync(process.env.STRIPE_TEST_KEY_FILE, "utf8") : "")).trim();
if (!/^(sk|rk)_test_[A-Za-z0-9_]+$/.test(key)) {
  console.error("A Stripe test-mode key is required in STRIPE_TEST_KEY or STRIPE_TEST_KEY_FILE. Nothing was called.");
  process.exit(2);
}
const lane = value("--lane") || config.lane;
const run = `${lane}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${randomUUID().slice(0, 6)}`;
const out = join(root, "release/out/stripe", run);
mkdirSync(out, { recursive: true });
const offers = config.offers.filter((o) => !value("--offers") || value("--offers").split(",").includes(o.id));
const cases = (value("--cases") ?? "readback,success,expire,replay,refund").split(",");
const supportedCases = ["readback", "success", "decline", "block", "3ds-pass", "3ds-fail", "expire", "replay", "lost-response", "refund", "renewal", "cancel"];
if (!offers.length || cases.some((name) => !supportedCases.includes(name)) ||
    (cases.includes("renewal") && (offers.length !== 1 || offers[0].mode !== "subscription"))) {
  console.error("Choose existing offers and supported cases; a clock run needs exactly one subscription offer.");
  process.exit(2);
}

// Stripe API, test mode only.
async function stripe(method, path, params) {
  const body = params ? new URLSearchParams(Object.entries(params).flatMap(([k, v]) => Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]])) : undefined;
  const res = await fetch(`https://api.stripe.com/v1/${path}${method === "GET" && body ? `?${body}` : ""}`, {
    method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": config.stripeVersion ?? "2026-11-18.endive" },
    body: method === "GET" ? undefined : body, redirect: "error", signal: AbortSignal.timeout(20000),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${method} ${path}: ${json.error?.message ?? res.status}`);
  if (json.livemode === true) throw new Error("A live-mode object came back. Stopping.");
  return json;
}

// The listener: Stripe-sent events forwarded to the preview's receiver.
const stripeCli = process.env.STRIPE_CLI || ["stripe", "/home/ubuntu/grand-stripe-cli-20261121/stripe", "/usr/local/bin/stripe", "/opt/homebrew/bin/stripe"].find((p) => p === "stripe" ? false : existsSync(p)) || "stripe";
const port = Number(value("--port") ?? config.port ?? 31871);
const preview = `http://127.0.0.1:${port}`;
const delivered = new Map(); // evt id -> response status from the receiver
let listenLog = "";
const listener = spawn(stripeCli, ["listen", "--skip-update", "--events", config.events.join(","), "--forward-to", preview + config.webhookPath], { env: { PATH: process.env.PATH, HOME: process.env.HOME, STRIPE_API_KEY: key }, stdio: ["ignore", "pipe", "pipe"] });
let webhookSecret = null;
const onListen = (chunk) => {
  const text = chunk.toString();
  listenLog = (listenLog + text).slice(-200000);
  webhookSecret ||= text.match(/whsec_[A-Za-z0-9]+/)?.[0] ?? null;
  for (const [, status, evt] of text.matchAll(/<--\s+\[(\d{3})\][^\n]*\[(evt_[A-Za-z0-9]+)\]/g)) delivered.set(evt, Number(status));
};
listener.stdout.on("data", onListen);
listener.stderr.on("data", onListen);
for (let i = 0; i < 60 && !webhookSecret && listener.exitCode === null; i++) await sleep(500);
if (!webhookSecret) { console.error("stripe listen did not start (is the Stripe CLI installed? set STRIPE_CLI)"); process.exit(2); }
console.log(`run ${run}: listener ready`);

const ctx = { root, port, preview, run, key, webhookSecret, stripe, out };
let app;
const shutdown = async () => { try { await app?.stop(); } catch {} listener.kill("SIGTERM"); };
process.on("SIGINT", async () => { await shutdown(); process.exit(130); });

const tools = join(here, "tools");
if (!existsSync(join(tools, "node_modules", "puppeteer-core"))) {
  const { execFileSync } = await import("node:child_process");
  execFileSync("npm", ["ci", "--prefix", tools, "--ignore-scripts", "--no-audit", "--no-fund"], { stdio: "inherit" });
}
const { default: puppeteer } = await import(pathToFileURL(createRequire(join(tools, "package.json")).resolve("puppeteer-core")).href);
const chrome = process.env.RELEASE_CHROME || ["/usr/bin/google-chrome", "/usr/local/bin/google-chrome", "/opt/google/chrome/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
const browser = await puppeteer.launch({ executablePath: chrome, headless: !args.includes("--headed"), args: ["--no-first-run", "--disable-dev-shm-usage"] });

// Stripe's hosted Checkout page: the payment form lives in one Elements frame. Link opt-in is on by
// default and would ask for a phone number, so it is switched off.
const CARDS = { success: "4242424242424242", decline: "4000000000000002", block: "4100000000000019", "3ds-pass": "4000000000003220", "3ds-fail": "4000000000003220" };
async function within(page, selector, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    for (const f of page.frames()) {
      // Query in the frame's main realm. Stripe's helper frames can prevent
      // Puppeteer's isolated selector realm from starting, stalling every field.
      const handle = await f.evaluateHandle((sel) => [...document.querySelectorAll(sel)].find((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return !el.disabled && rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }), selector).catch(() => null);
      const h = handle?.asElement();
      if (!h) { await handle?.dispose(); continue; }
      if (h && await h.boundingBox().catch(() => null)) return { f, h };
    }
    await sleep(300);
  }
  return null;
}
// A hosted form is loaded once. A blank form or failed navigation is a failed case.
async function payHosted(page, url, card, { threeDS } = {}) {
  const formReady = '#linkAuthentication-emailInput, #email, #payment-numberInput, #cardNumber, [data-value="card"]';
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  if (!(await within(page, formReady, 45000))) throw new Error("hosted page: the payment form did not appear");
  const typeInto = async (sel, text, need = true) => {
    const x = await within(page, sel, need ? 15000 : 2500);
    if (!x) { if (need) throw new Error(`hosted page: no ${sel}`); return; }
    // Clear whatever the page or the browser put there first; a triple click can leave text behind.
    await x.h.click();
    await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await x.h.type(text, { delay: 20 });
  };
  await typeInto("#linkAuthentication-emailInput, #email, input[name=email]", `buyer+${run}@example.com`, false);
  const cardTab = await within(page, '[data-value="card"], button[value="card"], #payment-card-tab, input[type=radio][value=card]', 4000);
  if (cardTab) await cardTab.h.click();
  await typeInto("#payment-numberInput, #cardNumber", card);
  await typeInto("#payment-expiryInput, #cardExpiry", "1234");
  await typeInto("#payment-cvcInput, #cardCvc", "123");
  await typeInto("#payment-nameInput, #billingName", "Release Test", false);
  const country = await within(page, "#payment-countryInput, #billingCountry", 2000);
  if (country) await country.f.select(await country.h.evaluate((e) => `#${e.id}`), "US");
  await typeInto("#payment-postalCodeInput, #billingPostalCode", "10001", false);
  const optIn = await within(page, "#payment-linkOptInInput, #enableStripePass", 2000);
  if (optIn && await optIn.h.evaluate((e) => e.checked)) await optIn.h.click();
  const submit = await within(page, '[data-testid="payment-form-submit-button"], button[type=submit].SubmitButton, button[type=submit]');
  await submit.h.click();
  if (threeDS) {
    // Stripe's 3D Secure 2 test page: a Complete and a Fail button inside nested frames.
    const label = threeDS === "pass" ? /^(complete|authorize)/i : /^fail/i;
    let clicked = false;
    for (let i = 0; i < 60 && !clicked; i++) {
      for (const f of page.frames()) {
        const buttons = await f.$$("button").catch(() => []);
        for (const b of buttons) {
          const text = (await b.evaluate((el) => el.textContent.trim()).catch(() => "")) ?? "";
          if (label.test(text) && await b.boundingBox().catch(() => null)) { await b.click(); clicked = true; break; }
        }
        if (clicked) break;
      }
      if (!clicked) await sleep(500);
    }
    if (!clicked) throw new Error("no 3D Secure test challenge appeared");
  }
}
async function buyerSaw(page, name) {
  const file = join(out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  const frames = await Promise.all(page.frames().map((f) => f.evaluate(() => document.body?.innerText ?? "").catch(() => "")));
  return { url: page.url().replace(/#.*/, "#<capability>"), screenshot: file.slice(root.length + 1), text: frames.join("\n").replace(/\s+\n/g, "\n").slice(0, 1500) };
}

async function eventFor(type, match, since) {
  for (let i = 0; i < 40; i++) {
    const list = await stripe("GET", "events", { type, "created[gte]": String(since - 5), limit: "50" });
    const evt = list.data.find((e) => match(e.data.object));
    if (evt) {
      for (let j = 0; j < 30 && !delivered.has(evt.id); j++) await sleep(1000);
      return { id: evt.id, type: evt.type, created: evt.created, deliveredThroughListener: delivered.get(evt.id) ?? null };
    }
    await sleep(1500);
  }
  return { type, missing: true };
}

async function advanceClock(timestamp) {
  await stripe("POST", `test_helpers/test_clocks/${ctx.clock.id}/advance`, { frozen_time: String(timestamp) });
  const end = Date.now() + 120000;
  while (Date.now() < end) {
    const clock = await stripe("GET", `test_helpers/test_clocks/${ctx.clock.id}`);
    if (clock.status === "ready") return clock;
    if (clock.status !== "advancing") throw new Error(`Test clock ${clock.status}`);
    await sleep(1000);
  }
  throw new Error("Test clock did not finish advancing");
}

function signed(payload) {
  const t = Math.floor(Date.now() / 1000);
  return `t=${t},v1=${createHmac("sha256", webhookSecret).update(`${t}.${payload}`).digest("hex")}`;
}

const pick = (s) => s && ({ id: s.id, status: s.status, payment_status: s.payment_status, amount_total: s.amount_total, currency: s.currency, mode: s.mode, livemode: s.livemode, release_run: s.metadata?.release_run, payment_intent: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null, subscription: s.subscription ?? null });
const records = [];
function record(offer, name, rec) {
  const row = { run, offer: offer.id, case: name, at: new Date().toISOString(), ...rec };
  writeFileSync(join(out, `${offer.id}-${name}.json`), JSON.stringify(row, null, 2) + "\n");
  records.push(row);
  console.log(`${row.state.padEnd(7)} ${offer.id} ${name}${row.why ? `: ${row.why}` : ""}`);
}

try {
  if (cases.includes("renewal")) {
    ctx.clock = await stripe("POST", "test_helpers/test_clocks", { frozen_time: String(Math.floor(Date.now() / 1000)), name: run });
    const customer = await stripe("POST", "customers", { test_clock: ctx.clock.id, email: `buyer+${run}@example.test`, "metadata[release_run]": run });
    ctx.clockCustomer = customer.id;
  }
  app = await adapter.start(ctx);
  console.log(`preview ${preview} started`);
  const paid = new Map(); // offer id -> { session, order, page }
  for (const offer of offers) {
    for (const name of cases) {
      if (offer.cases && !offer.cases.includes(name)) continue;
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 1000 });
      // A site whose success URL is its production origin (EIN.LLC refuses a loopback PUBLIC_URL): the
      // return navigation is recorded and stopped here, so the run never loads the live site.
      page.returnedTo = null;
      if (config.successOrigin) {
        await page.setRequestInterception(true);
        page.on("request", (r) => {
          if (r.isNavigationRequest() && r.url().startsWith(config.successOrigin)) { page.returnedTo = r.url().replace(/[?#].*/, "?<redacted>"); r.abort().catch(() => {}); }
          else r.continue().catch(() => {});
        });
      }
      const since = Math.floor(Date.now() / 1000);
      try {
        if (name === "readback" || name === "lost-response") {
          const shown = await adapter.shownPrice(ctx, offer, page);
          const a = await adapter.open(ctx, offer);
          const b = name === "lost-response" ? await adapter.open(ctx, offer, { again: a }) : null;
          const session = await stripe("GET", `checkout/sessions/${a.sessionId}`);
          const ok = session.amount_total === offer.cents && session.currency === offer.currency && session.metadata?.release_run === run && shown.cents === offer.cents && (!b || b.sessionId === a.sessionId);
          await stripe("POST", `checkout/sessions/${a.sessionId}/expire`).catch(() => {});
          record(offer, name, { state: ok ? "passed" : "failed", why: ok ? undefined : `shown ${shown.cents}, session ${session.amount_total} ${session.currency}, run ${session.metadata?.release_run}${b ? `, retried session ${b.sessionId === a.sessionId ? "same" : "different"}` : ""}`,
            buyer: shown, stripe: pick(session), webhook: null, stored: await adapter.storedRow(ctx, a) });
        } else if (["success", "decline", "block", "3ds-pass", "3ds-fail"].includes(name)) {
          const a = await adapter.open(ctx, offer);
          const shouldPay = name === "success" || name === "3ds-pass";
          let hosted = null;
          await payHosted(page, a.url, CARDS[name], { threeDS: name.startsWith("3ds") ? name.slice(4) : null });
          if (shouldPay) {
            await page.waitForFunction((origin) => location.href.startsWith(origin), { timeout: 60000 }, preview);
          }
          if (!shouldPay) { await sleep(6000); hosted = await buyerSaw(page, `${offer.id}-${name}-hosted`); }
          const session = await stripe("GET", `checkout/sessions/${a.sessionId}`);
          const webhook = shouldPay ? await eventFor("checkout.session.completed", (o) => o.id === a.sessionId, since) : null;
          if (shouldPay) {
            await sleep(2000);
            await adapter.settled?.(ctx, a);
          }
          const buyer = shouldPay ? await adapter.buyerScreen(ctx, a, page, `${offer.id}-${name}`) : await buyerSaw(page, `${offer.id}-${name}`);
          const stored = await adapter.storedRow(ctx, a);
          const ok = shouldPay
            ? session.status === "complete" && session.payment_status === "paid" && webhook?.deliveredThroughListener === 200 && adapter.isPaid(stored) && buyer.ok !== false
            : session.status === "open" && session.payment_status === "unpaid" && !adapter.isPaid(stored);
          if (!shouldPay) await stripe("POST", `checkout/sessions/${a.sessionId}/expire`).catch(() => {});
          if (shouldPay && ok) paid.set(offer.id, { a, session });
          record(offer, name, { state: ok ? "passed" : "failed", why: ok ? undefined : `session ${session.status}/${session.payment_status}, webhook ${webhook?.deliveredThroughListener ?? "none"}, stored ${adapter.describe(stored)}`, buyer, hostedPage: hosted, stripe: pick(session), webhook, stored });
        } else if (name === "expire") {
          const a = await adapter.open(ctx, offer);
          const session = await stripe("POST", `checkout/sessions/${a.sessionId}/expire`);
          const webhook = await eventFor("checkout.session.expired", (o) => o.id === a.sessionId, since);
          await sleep(1500);
          const stored = await adapter.storedRow(ctx, a);
          const buyer = await adapter.buyerScreen(ctx, a, page, `${offer.id}-expire`);
          const ok = session.status === "expired" && webhook?.deliveredThroughListener === 200 && adapter.isExpired(stored);
          record(offer, name, { state: ok ? "passed" : "failed", why: ok ? undefined : `session ${session.status}, webhook ${webhook?.deliveredThroughListener ?? "none"}, stored ${adapter.describe(stored)}`, buyer, stripe: pick(session), webhook, stored });
        } else if (name === "replay") {
          const p = paid.get(offer.id);
          if (!p) { record(offer, name, { state: "not run", why: "needs a passed success case first" }); continue; }
          const evt = await stripe("GET", "events", { type: "checkout.session.completed", limit: "50", "created[gte]": String(p.session.created - 5) }).then((l) => l.data.find((e) => e.data.object.id === p.a.sessionId));
          const before = await adapter.storedRow(ctx, p.a);
          // First Stripe's own resend to the running listener, then the same event signed again here.
          const seen = () => [...listenLog.matchAll(new RegExp(`<--\\s+\\[(\\d{3})\\][^\\n]*\\[${evt.id}\\]`, "g"))].map((m) => Number(m[1]));
          const beforeCount = seen().length;
          const resend = await new Promise((resolve) => {
            const c = spawn(stripeCli, ["events", "resend", evt.id], { env: { PATH: process.env.PATH, HOME: process.env.HOME, STRIPE_API_KEY: key }, stdio: ["ignore", "pipe", "pipe"] });
            let text = "";
            c.stdout.on("data", (d) => { text += d; });
            c.stderr.on("data", (d) => { text += d; });
            c.on("close", (code) => resolve({ exit: code, said: text.replace(/whsec_[A-Za-z0-9]+/g, "whsec_<redacted>").split("\n")[0].slice(0, 120) }));
          });
          for (let i = 0; i < 20 && seen().length === beforeCount; i++) await sleep(1000);
          const resentByStripe = { ...resend, deliveredAgain: seen().length > beforeCount, receiverStatus: seen().at(-1) ?? null };
          const payload = JSON.stringify(evt);
          const res = await fetch(preview + config.webhookPath, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signed(payload) }, body: payload });
          await sleep(1500);
          const after = await adapter.storedRow(ctx, p.a);
          const count = await adapter.orderCount(ctx, p.a);
          const ok = res.status < 300 && count === 1 && JSON.stringify(adapter.comparable(before)) === JSON.stringify(adapter.comparable(after));
          record(offer, name, { state: ok ? "passed" : "failed", why: ok ? undefined : `receiver ${res.status}, orders ${count}, row changed ${JSON.stringify(adapter.comparable(before)) !== JSON.stringify(adapter.comparable(after))}`,
            buyer: null, stripe: pick(p.session), webhook: { id: evt.id, type: evt.type, resentByStripe, replayedWithListenerSecret: true, receiverStatus: res.status }, stored: after, ordersForSession: count });
        } else if (name === "renewal") {
          const p = paid.get(offer.id);
          if (!p || !ctx.clock) throw new Error("Renewal needs a passed hosted success on a test clock");
          const initial = await adapter.periods(ctx, p.a);
          if (initial.length !== 1) throw new Error(`Expected one paid initial period, got ${initial.length}`);
          const boundary = Math.floor(Date.parse(initial[0].period_end) / 1000);
          const clocks = [await advanceClock(boundary), await advanceClock(boundary + 7200)];
          const invoices = await stripe("GET", "invoices", { customer: ctx.clockCustomer, subscription: p.session.subscription, limit: "10" });
          const renewal = invoices.data.find((i) => i.billing_reason === "subscription_cycle");
          if (!renewal) throw new Error("The clock produced no renewal invoice");
          const webhook = await eventFor("invoice.paid", (o) => o.id === renewal.id, since);
          const periods = await adapter.periods(ctx, p.a);
          const stored = await adapter.storedRow(ctx, p.a);
          const buyer = await adapter.buyerScreen(ctx, p.a, page, `${offer.id}-renewal`);
          const ok = renewal.status === "paid" && renewal.amount_paid === offer.cents &&
            renewal.currency === offer.currency && webhook.deliveredThroughListener === 200 &&
            periods.length === 2 && periods.some((r) => r.invoice_id === renewal.id && r.status === "ready") && buyer.ok;
          record(offer, name, { state: ok ? "passed" : "failed", buyer, stripe: { clock: clocks.map(({id, status, frozen_time}) => ({id, status, frozen_time})), invoice: renewal }, webhook, stored, periods });
        } else if (name === "cancel") {
          const p = paid.get(offer.id);
          if (!p) throw new Error("Cancellation needs a passed hosted subscription payment");
          await page.goto(adapter.cancellationLink(ctx, p.a), { waitUntil: "networkidle2" });
          await page.click("main button");
          await page.waitForFunction(() => location.hostname === "billing.stripe.com", { timeout: 30000 });
          const button = await within(page, '[data-testid="cancel-subscription"], button[type="submit"]', 10000);
          if (button) await button.h.click();
          else {
            const buttons = await page.$$("button");
            let clicked = false;
            for (const b of buttons) {
              if (/cancel subscription/i.test(await b.evaluate((el) => el.textContent)) && await b.boundingBox()) {
                await b.click(); clicked = true; break;
              }
            }
            if (!clicked) throw new Error("The hosted portal showed no cancellation action");
          }
          const webhook = await eventFor("customer.subscription.updated", (o) => o.id === p.session.subscription && o.cancel_at_period_end === true, since);
          const subscription = await stripe("GET", `subscriptions/${p.session.subscription}`);
          const stored = await adapter.storedRow(ctx, p.a);
          const buyer = await adapter.buyerScreen(ctx, p.a, page, `${offer.id}-cancel`);
          const ok = subscription.cancel_at_period_end === true && stored.cancel_at_period_end === true &&
            webhook.deliveredThroughListener === 200 && buyer.text.includes("will not renew");
          record(offer, name, { state: ok ? "passed" : "failed", buyer, stripe: { id: subscription.id, status: subscription.status, cancel_at_period_end: subscription.cancel_at_period_end }, webhook, stored });
        } else if (name === "refund") {
          const p = paid.get(offer.id);
          if (!p) { record(offer, name, { state: "not run", why: "needs a passed success case first" }); continue; }
          let pi = p.session.payment_intent ?? (await stripe("GET", `checkout/sessions/${p.a.sessionId}`)).payment_intent;
          if (!pi && p.session.subscription) {
            const subscription = await stripe("GET", `subscriptions/${p.session.subscription}`);
            const invoice = await stripe("GET", `invoices/${subscription.latest_invoice}`, { "expand[]": "payments" });
            pi = invoice.payments?.data?.find((p) => p.payment?.type === "payment_intent")?.payment.payment_intent;
          }
          if (!pi) throw new Error("The paid invoice has no payment intent to refund");
          const refund = await stripe("POST", "refunds", { payment_intent: pi, "metadata[release_run]": run });
          const webhook = await eventFor("charge.refunded", (o) => o.payment_intent === pi, since);
          await sleep(1500);
          const stored = await adapter.storedRow(ctx, p.a);
          const buyer = await adapter.buyerScreen(ctx, p.a, page, `${offer.id}-refund`);
          const ok = refund.status === "succeeded" && webhook?.deliveredThroughListener === 200 && adapter.isRefunded(stored) && buyer.showsRefund !== false;
          record(offer, name, { state: ok ? "passed" : "failed", why: ok ? undefined : `refund ${refund.status}, webhook ${webhook?.deliveredThroughListener ?? "none"}, stored ${adapter.describe(stored)}, buyer page shows refund ${buyer.showsRefund}`,
            buyer, stripe: { refund: { id: refund.id, status: refund.status, amount: refund.amount }, session: pick(p.session) }, webhook, stored });
        }
      } catch (e) {
        record(offer, name, { state: "failed", why: e.message.slice(0, 300), buyer: await buyerSaw(page, `${offer.id}-${name}-error`) });
      } finally { await page.close().catch(() => {}); }
    }
  }
} finally {
  await browser.close().catch(() => {});
  await shutdown();
  writeFileSync(join(out, "listener.log"), listenLog.replace(/whsec_[A-Za-z0-9]+/g, "whsec_<redacted>"));
}
const summary = { run, lane, startedFor: offers.map((o) => o.id), cases, passed: records.filter((r) => r.state === "passed").length, failed: records.filter((r) => r.state === "failed").length, notRun: records.filter((r) => r.state === "not run").length, records: records.map(({ offer, case: c, state, why }) => ({ offer, case: c, state, why })) };
writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(`\n${summary.passed} passed, ${summary.failed} failed, ${summary.notRun} not run. Records in release/out/stripe/${run}/`);
process.exit(summary.failed || summary.notRun ? 1 : 0);
