// The non-card monthly route (SDS_CARE_NONCARD=1) end to end in Stripe test mode: the private preview on a
// throwaway PostgreSQL (stripe-adapter.mjs start), Stripe-sent webhooks through `stripe listen`, and the
// buyer's receipt page. Bank transfer is paid with Stripe's test helper that funds the customer's
// bank-transfer balance; a stablecoin invoice is opened and its hosted page captured (paying it needs a
// testnet wallet, which this script does not hold).
//
//   STRIPE_TEST_KEY_FILE=<file> node scripts/release/noncard-preview.mjs [--methods bank_transfer,stablecoin]
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as adapter from "./stripe-adapter.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const config = JSON.parse(readFileSync(join(root, "release/offers.json"), "utf8"));
const arg = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
const methods = (arg("--methods") ?? "bank_transfer,stablecoin").split(",");
const key = readFileSync(process.env.STRIPE_TEST_KEY_FILE ?? "", "utf8").trim();
if (!/^(sk|rk)_test_[A-Za-z0-9_]+$/.test(key)) throw new Error("A Stripe test-mode key file is required in STRIPE_TEST_KEY_FILE");
const run = `SDS-NONCARD-${new Date().toISOString().replace(/\D/g, "").slice(0, 12)}-${Math.floor(Math.random() * 1e6)}`;
const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const out = join(root, "release/out/noncard", run);
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function stripe(method, path, params) {
  const body = params ? new URLSearchParams(params) : undefined;
  const res = await fetch(`https://api.stripe.com/v1/${path}${method === "GET" && body ? `?${body}` : ""}`, {
    method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": config.stripeVersion },
    body: method === "GET" ? undefined : body, signal: AbortSignal.timeout(20000) });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${method} ${path}: ${json.error?.message ?? res.status}`);
  if (json.livemode === true) throw new Error("A live-mode object came back. Stopping.");
  return json;
}

const stripeCli = process.env.STRIPE_CLI || ["/home/ubuntu/grand-stripe-cli-20261121/stripe", "/usr/local/bin/stripe"].find(existsSync) || "stripe";
const port = config.port, preview = `http://127.0.0.1:${port}`;
const delivered = [];
const listener = spawn(stripeCli, ["listen", "--skip-update", "--events", config.events.join(","), "--forward-to", preview + config.webhookPath],
  { env: { PATH: process.env.PATH, HOME: process.env.HOME, STRIPE_API_KEY: key }, stdio: ["ignore", "pipe", "pipe"] });
let webhookSecret = null, listenLog = "";
const onListen = (chunk) => {
  const text = String(chunk);
  listenLog += text;
  webhookSecret ||= text.match(/whsec_[A-Za-z0-9]+/)?.[0] ?? null;
  // `stripe listen` prints "--> invoice.paid [evt_...]" and then "<--  [200] POST <url> [evt_...]".
  for (const [, status, id] of text.matchAll(/<--\s+\[(\d{3})\][^\n]*\[(evt_[A-Za-z0-9]+)\]/g)) delivered.push({ id, status: Number(status) });
};
listener.stdout.on("data", onListen); listener.stderr.on("data", onListen);
for (let i = 0; i < 60 && !webhookSecret; i++) await sleep(500);
if (!webhookSecret) throw new Error("stripe listen did not start");

const kit = process.env.RELEASE_KIT_DIR ?? execFileSync(process.execPath, [join(root, "scripts/release/kit.mjs"), "path"], { encoding: "utf8" }).trim().split("\n").at(-1);
const req = createRequire(join(kit, "package.json"));
const puppeteer = req("puppeteer-core");
const browser = await puppeteer.launch({ executablePath: process.env.RELEASE_CHROME || "/usr/bin/google-chrome", headless: true, args: ["--no-first-run"] });
const ctx = { root, source, port, preview, run, key, webhookSecret, stripe, out, offers: [], extraEnv: { SDS_CARE_NONCARD: "1" } };
const app = await adapter.start(ctx);
const results = [];
const subscriptions = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const methodsOffered = await (await fetch(`${preview}/api/care/methods`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ offer: "keep_it_working" }) })).json();
  // The buy page as a buyer sees it with the flag on.
  await page.goto(`${preview}/care/buy?offer=keep_it_working`, { waitUntil: "networkidle2" });
  await page.screenshot({ path: join(out, "buy-page.png"), fullPage: true });
  for (const method of methods) {
    const order = randomUUID(), email = `buyer+${run.toLowerCase()}-${method}@example.com`;
    const started = await (await fetch(`${preview}/api/care/checkout`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ offer: "keep_it_working", order, method, email }) })).json();
    if (!started.receipt) throw new Error(`${method}: ${JSON.stringify(started)}`);
    const before = await adapter.storedRow(ctx, { order });
    if (!before?.subscription_id) throw new Error(`${method}: the invoice route did not bind a subscription`);
    const sub = await stripe("GET", `subscriptions/${before.subscription_id}`);
    subscriptions.push(sub.id);
    const invoice = await stripe("GET", `invoices/${sub.latest_invoice}`);
    const receiptOpen = await shot(page, started.receipt.replace(/^https?:\/\/[^/]+/, preview), `${method}-receipt-open`);
    const hosted = await browser.newPage();
    await hosted.setViewport({ width: 1280, height: 1000 });
    await hosted.goto(invoice.hosted_invoice_url, { waitUntil: "networkidle2", timeout: 60000 });
    await sleep(2500);
    await hosted.screenshot({ path: join(out, `${method}-hosted-invoice.png`), fullPage: true });
    const hostedText = (await hosted.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 400);
    await hosted.close();
    const result = { method, order, email, subscription: sub.id, invoice: invoice.id, collection: sub.collection_method,
      paymentMethodTypes: invoice.payment_settings?.payment_method_types, invoiceStatusBefore: invoice.status, storedBefore: before,
      receiptOpen, hostedText };
    if (method === "bank_transfer") {
      const funded = await stripe("POST", `test_helpers/customers/${sub.customer}/fund_cash_balance`, { amount: "10000", currency: "usd", reference: run });
      let row;
      for (let i = 0; i < 60; i++) { row = await adapter.storedRow(ctx, { order }); if (row?.state === "paid") break; await sleep(1000); }
      const paidInvoice = await stripe("GET", `invoices/${invoice.id}`);
      const events = (await stripe("GET", "events", { type: "invoice.paid", limit: "20" })).data.filter((e) => e.data.object.id === invoice.id);
      result.paid = { funding: funded.id, fundingType: funded.type, invoiceStatus: paidInvoice.status, amountPaid: paidInvoice.amount_paid,
        stored: row, webhook: events.map((e) => ({ id: e.id, delivered: delivered.find((d) => d.id === e.id) ?? null })),
        receiptPaid: await shot(page, started.receipt.replace(/^https?:\/\/[^/]+/, preview), `${method}-receipt-paid`) };
    }
    results.push(result);
  }
  const summary = { run, source, at: new Date().toISOString(), methodsOffered, results, listener: delivered };
  writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(out, "listener.log"), listenLog.replace(/whsec_[A-Za-z0-9]+/g, "whsec_<redacted>"));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  for (const id of subscriptions) await stripe("DELETE", `subscriptions/${id}`).catch(() => {});
  await browser.close();
  await app.stop();
  listener.kill("SIGTERM");
}

async function shot(page, link, name) {
  // The receipt reads its state on load; a hash-only change to the same page would not reload it.
  await page.goto("about:blank");
  await page.goto(link, { waitUntil: "networkidle2" });
  await sleep(1500);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  const text = await page.evaluate(() => document.querySelector("main")?.innerText ?? document.body.innerText);
  return { screenshot: `${name}.png`, text: text.replace(/\s+/g, " ").slice(0, 400) };
}
