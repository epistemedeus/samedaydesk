#!/usr/bin/env node
// npm run release:stripe -- [--offers id,id] [--cases success,expire,replay,refund] [--lane SDS] [--headed]
//                          [--form-check N]  (load N fresh hosted pages, pay nothing; see formCheck)
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
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD");
if (git("status", "--porcelain", "--untracked-files=no")) throw new Error("Commit the source before a provider test");
const source = commit;
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
const buyerEmail = cases.includes("receipt") ? "contact@samedaydesk.com" : `buyer+${run}@example.com`;
const supportedCases = ["readback", "success", "decline", "block", "3ds-pass", "3ds-fail", "expire", "replay", "lost-response", "refund", "renewal", "cancel", "receipt"];
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
  }).catch((e) => { throw new Error(`Stripe ${method} ${path}: ${e.cause?.code ?? e.message}`); });
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

const ctx = { root, source, port, preview, run, key, webhookSecret, stripe, out, buyerEmail, offers };
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
// Site isolation is off in this test browser only. With it on, Puppeteer loses the execution context of
// Stripe's out-of-process Elements frame in about two loads in five (7 of 12 reached on November 21)
// although the form is on screen; with it off, 12 of 12. That was the "form did not appear" failure.
const browser = await puppeteer.launch({ executablePath: chrome, headless: !args.includes("--headed"), args: ["--no-first-run", "--disable-dev-shm-usage", "--disable-features=IsolateOrigins,site-per-process", "--disable-site-isolation-trials"] });

// Stripe's hosted Checkout page: the payment form lives in one Elements frame. Link opt-in is on by
// default and would ask for a phone number, so it is switched off.
const CARDS = { success: "4242424242424242", decline: "4000000000000002", block: "4100000000000019", "3ds-pass": "4000000000003220", "3ds-fail": "4000000000003220" };
async function within(page, selector, ms = 15000, buttonText = null) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    for (const f of formFrames(page)) {
      // Query in the frame's main realm. Stripe's helper frames can prevent
      // Puppeteer's isolated selector realm from starting, stalling every field.
      const handle = await quick(f.evaluateHandle((sel, text) => [...document.querySelectorAll(sel)].find((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return !el.disabled && rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" &&
          (!text || new RegExp(text, "i").test(el.textContent.trim()));
      }), selector, buttonText));
      const h = handle?.asElement();
      if (!h) { await handle?.dispose(); continue; }
      if (await quick(h.boundingBox())) return { f, h };
      await h.dispose();
    }
    await sleep(300);
  }
  return null;
}
// The hosted form is ready when the card number input is visible inside Stripe's frame and that frame
// is wider than 300 px. When the account offers several payment methods the form opens as a list with
// Card collapsed; Card is clicked once, when its row has not moved for half a second (the wallet buttons
// load late and push the list down, and an earlier click lands on empty space: 7 of 10 were lost on
// November 21). A form that is not ready in 30 s fails the case with its evidence: no reload, no second
// attempt.
const CARD_INPUT = "#payment-numberInput, #cardNumber";
const CARD_CHOICE = '[data-value="card"], #payment-method-label-card';
// Only the page itself and Stripe's Elements frames are asked: a call into one of the other frames
// (fraud, captcha, wallets) can hang for 30 s, which looked like a form that never appeared.
const formFrames = (page) => page.frames().filter((f) => f === page.mainFrame() || f.url().startsWith("https://js.stripe.com/v3/elements-inner"));
const quick = (p) => Promise.race([p.catch(() => null), sleep(2000).then(() => null)]);
async function formState(page) {
  const state = { inDom: false, visible: false, frameWidth: 0, choice: null };
  for (const f of formFrames(page)) {
    const h = await quick(f.$(CARD_INPUT));
    const choice = h ? null : await quick(f.$(CARD_CHOICE));
    if (!h && !choice) continue;
    const frameEl = f === page.mainFrame() ? null : await quick(f.frameElement());
    const frameBox = frameEl ? await quick(frameEl.boundingBox()) : await quick(page.evaluate(() => ({ width: innerWidth })));
    Object.assign(state, { frame: f, frameEl, frameWidth: Math.round(frameBox?.width ?? 0) });
    if (h) {
      const box = await quick(h.boundingBox());
      return { ...state, inDom: true, visible: Boolean(box && box.width > 0 && box.height > 0) };
    }
    const box = await quick(choice.boundingBox());
    if (box) Object.assign(state, { choice, choiceAt: `${Math.round(box.x)},${Math.round(box.y)}` });
  }
  return state;
}
async function openHosted(page, url) {
  const t0 = Date.now();
  if (url) await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  let st, chose = null, at = null, still = 0;
  while (Date.now() - t0 < 30000) {
    st = await formState(page);
    if (st.visible && st.frameWidth > 300) return { ...st, msToReady: Date.now() - t0, msToCardChoice: chose };
    still = st.choiceAt && st.choiceAt === at ? still + 1 : 0;
    at = st.choiceAt ?? null;
    if (!st.inDom && still >= 2 && chose === null && await quick(st.choice.click().then(() => true))) chose = Date.now() - t0;
    await sleep(250);
  }
  const e = new Error(`hosted page: the card form was not ready in 30 s (card input in DOM ${st.inDom}, visible ${st.visible}, frame ${st.frameWidth} px, card choice ${st.choice ? "shown" : "not shown"}${chose !== null ? " and clicked" : ""})`);
  e.form = { inDom: st.inDom, visible: st.visible, frameWidth: st.frameWidth, cardChoice: Boolean(st.choice), cardChoiceClicked: chose !== null };
  throw e;
}
// A hosted form is loaded once. A blank form or failed navigation is a failed case.
async function payHosted(page, url, card, { threeDS } = {}) {
  await openHosted(page, url);
  const typeInto = async (sel, text, need = true) => {
    const x = await within(page, sel, need ? 15000 : 2500);
    if (!x) { if (need) throw new Error(`hosted page: no ${sel}`); return; }
    // Clear whatever the page or the browser put there first; a triple click can leave text behind.
    await x.h.focus();
    if (!(await x.h.evaluate((el) => document.activeElement === el))) throw new Error(`hosted page: could not focus ${sel}`);
    await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await x.h.type(text, { delay: 20 });
  };
  await typeInto("#linkAuthentication-emailInput, #email, input[name=email]", buyerEmail, false);
  await typeInto("#payment-numberInput, #cardNumber", card);
  await typeInto("#payment-expiryInput, #cardExpiry", "1234");
  await typeInto("#payment-cvcInput, #cardCvc", "123");
  await typeInto("#payment-nameInput, #billingName", "Release Test", false);
  const country = await within(page, "#payment-countryInput, #billingCountry", 2000);
  if (country) await country.f.select(await country.h.evaluate((e) => `#${e.id}`), "US");
  await typeInto("#payment-postalCodeInput, #billingPostalCode", "10001", false);
  const optIn = await within(page, "#payment-linkOptInInput, #enableStripePass", 2000);
  if (optIn && await optIn.h.evaluate((e) => e.checked)) await optIn.h.click();
  const submit = await within(page, '[data-testid="payment-form-submit-button"], button[type=submit].SubmitButton, button[type=submit]', 15000, "^(subscribe|pay(?:\\s|$))");
  if (!submit) throw new Error("hosted page: no enabled Pay or Subscribe action");
  // Use the focused control's keyboard action. Remote desktop geometry can
  // differ from the cross-origin frame's coordinates; a coordinate click may
  // leave the correctly filled form untouched.
  await submit.h.focus();
  if (!(await submit.h.evaluate((el) => document.activeElement === el))) throw new Error("hosted page: could not focus Subscribe or Pay");
  await page.keyboard.press("Enter");
  if (threeDS) {
    // Stripe's 3D Secure 2 test page: a Complete and a Fail button inside nested frames.
    const label = threeDS === "pass" ? /^(complete|authorize)/i : /^fail/i;
    let clicked = false;
    for (let i = 0; i < 60 && !clicked; i++) {
      for (const f of page.frames()) {
        const buttons = (await quick(f.$$("button"))) ?? [];
        for (const b of buttons) {
          const text = (await quick(b.evaluate((el) => el.textContent.trim()))) ?? "";
          if (label.test(text) && await quick(b.boundingBox())) { await b.click(); clicked = true; break; }
        }
        if (clicked) break;
      }
      if (!clicked) await sleep(500);
    }
    if (!clicked) throw new Error("no 3D Secure test challenge appeared");
  }
}
// Viewport screenshots only: a full-page capture resizes the viewport, and Stripe's out-of-process
// frames are often not repainted when it is taken (they come out blank). Scroll the part that matters
// into view instead.
async function buyerSaw(page, name, focus = null) {
  const file = join(out, `${name}.png`);
  if (focus) await focus.evaluate((e) => e.scrollIntoView({ block: "center" })).catch(() => {});
  await page.screenshot({ path: file }).catch(() => {});
  const frames = await Promise.all(page.frames().map(async (f) => (await quick(f.evaluate(() => document.body?.innerText ?? ""))) ?? ""));
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

// --form-check N: open N fresh sessions of the first offer and load each hosted page once, paying
// nothing. Per load: is the card input in the DOM and visible, the frame's width, time to ready, and
// how blank the form area is in a viewport screenshot and in a full-page one (luminance spread in the
// frame's rectangle; under 3 counts as blank). Console errors and failed requests are kept per load.
async function spread(png, rect) {
  const p = await browser.newPage();
  try {
    return await p.evaluate(async (src, r) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = new OffscreenCanvas(Math.max(1, r.width), Math.max(1, r.height)).getContext("2d");
      c.drawImage(img, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
      const d = c.getImageData(0, 0, r.width, r.height).data;
      let n = 0, sum = 0, sq = 0;
      for (let i = 0; i < d.length; i += 16) { const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; sum += y; sq += y * y; }
      return Math.round(Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2)) * 10) / 10;
    }, `data:image/png;base64,${png}`, rect);
  } finally { await p.close(); }
}
async function formCheck(offer, n) {
  const loads = [];
  for (let i = 1; i <= n; i++) {
    const page = await browser.newPage();
    const a = await adapter.open(ctx, offer, { page });
    await page.setViewport({ width: 1280, height: 1000 });
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    page.on("requestfailed", (r) => errors.push(`failed ${r.url().slice(0, 120)}: ${r.failure()?.errorText}`));
    page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url().slice(0, 120)}`); });
    const load = { i, session: a.sessionId, headed: args.includes("--headed") };
    try {
      const st = await openHosted(page, a.url);
      Object.assign(load, { inDom: true, visible: true, frameWidth: st.frameWidth, msToReady: st.msToReady, msToCardChoice: st.msToCardChoice });
      await sleep(1500);
      // The viewport capture first: a full-page capture resizes the viewport and can leave Stripe's
      // frame unpainted for the captures after it.
      await st.frameEl.evaluate((e) => e.scrollIntoView({ block: "start" }));
      const box = await st.frameEl.boundingBox();
      const file = join(out, `form-check-${String(i).padStart(2, "0")}.png`);
      const view = await page.screenshot({ encoding: "base64" });
      writeFileSync(file, Buffer.from(view, "base64"));
      const y = Math.max(0, Math.round(box.y));
      load.viewportSpread = await spread(view, { x: Math.round(box.x), y, width: Math.round(box.width), height: Math.min(Math.round(box.height), 1000 - y) });
      await page.evaluate(() => scrollTo(0, 0));
      const top = await st.frameEl.boundingBox();
      const full = await page.screenshot({ fullPage: true, encoding: "base64" });
      load.fullPageSpread = await spread(full, { x: Math.round(top.x), y: Math.round(top.y), width: Math.round(top.width), height: Math.round(Math.min(top.height, 900)) });
      load.screenshot = file.slice(root.length + 1);
    } catch (e) {
      Object.assign(load, e.form ?? { inDom: false }, { error: e.message.slice(0, 200), frames: page.frames().map((f) => f.url().replace(/#.*/, "#<redacted>").slice(0, 120)),
        formFrames: await Promise.all(formFrames(page).map(async (f) => ({ url: f.url().slice(0, 70), detached: f.detached, page: await quick(f.evaluate(() => `${document.readyState}, ${document.querySelectorAll("*").length} elements, card choice ${Boolean(document.querySelector('[data-value="card"]'))}, card input ${Boolean(document.querySelector("#payment-numberInput"))}`)) }))) });
      const file = join(out, `form-check-${String(i).padStart(2, "0")}-missing.png`);
      await page.screenshot({ path: file }).catch(() => {});
      load.screenshot = file.slice(root.length + 1);
    }
    load.viewportBlank = load.viewportSpread !== undefined ? load.viewportSpread < 3 : null;
    load.fullPageBlank = load.fullPageSpread !== undefined ? load.fullPageSpread < 3 : null;
    load.errors = errors.slice(0, 20);
    loads.push(load);
    console.log(`load ${i}: in DOM ${load.inDom}, visible ${load.visible ?? false}, frame ${load.frameWidth ?? 0} px, ready ${load.msToReady ?? "-"} ms, spread viewport ${load.viewportSpread ?? "-"} full page ${load.fullPageSpread ?? "-"}`);
    await page.close().catch(() => {});
    await stripe("POST", `checkout/sessions/${a.sessionId}/expire`).catch(() => {});
  }
  const count = (f) => loads.filter(f).length;
  const summary = { run, offer: offer.id, loads: n, headed: args.includes("--headed"),
    formMissingInDom: count((l) => !l.inDom), inDomNotReady: count((l) => l.inDom && l.error),
    viewportBlank: count((l) => l.viewportBlank), fullPageBlankOnly: count((l) => l.fullPageBlank && !l.viewportBlank),
    msToReady: loads.filter((l) => l.msToReady).map((l) => l.msToReady).sort((x, y) => x - y), records: loads };
  writeFileSync(join(out, "form-check.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(`\nform check: ${n} loads, missing in DOM ${summary.formMissingInDom}, in DOM but not ready ${summary.inDomNotReady}, viewport blank ${summary.viewportBlank}, blank only in the full-page capture ${summary.fullPageBlankOnly}. release/out/stripe/${run}/form-check.json`);
  return summary;
}

const pick = (s) => s && ({ id: s.id, status: s.status, payment_status: s.payment_status, amount_total: s.amount_total, currency: s.currency, mode: s.mode, livemode: s.livemode, release_run: s.metadata?.release_run, payment_intent: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null, subscription: s.subscription ?? null });
const records = [];
function record(offer, name, rec) {
  const row = { run, commit, source, offer: offer.id, case: name, at: new Date().toISOString(), ...rec };
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
  if (value("--form-check")) {
    const summary = await formCheck(offers[0], Number(value("--form-check")));
    await browser.close().catch(() => {});
    await shutdown();
    process.exit(summary.formMissingInDom || summary.inDomNotReady || summary.viewportBlank ? 1 : 0);
  }
  const paid = new Map(); // offer id -> { session, order, page }
  for (const offer of offers) {
    for (const name of cases) {
      if (offer.cases && !offer.cases.includes(name)) continue;
      const page = await browser.newPage();
      // Stripe's narrow layout keeps the hosted form in one column, including
      // on a remote desktop whose physical window is smaller than the preview.
      await page.setViewport({ width: 800, height: 1000 });
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
          const a = await adapter.open(ctx, offer, { page });
          const b = name === "lost-response" ? await adapter.open(ctx, offer, { again: a, page }) : null;
          const session = await stripe("GET", `checkout/sessions/${a.sessionId}`);
          const ok = session.amount_total === offer.cents && session.currency === offer.currency && session.metadata?.release_run === run && shown.cents === offer.cents && (!b || b.sessionId === a.sessionId);
          await stripe("POST", `checkout/sessions/${a.sessionId}/expire`).catch(() => {});
          const webhook = name === "lost-response" ? await eventFor("checkout.session.expired", o => o.id === a.sessionId, since) : null;
          const oneOrder = name !== "lost-response" || await adapter.orderCount(ctx, a) === 1;
          const accepted = ok && oneOrder && (name !== "lost-response" || webhook?.deliveredThroughListener === 200);
          record(offer, name, { state: accepted ? "passed" : "failed", why: accepted ? undefined : `shown ${shown.cents}, session ${session.amount_total} ${session.currency}, run ${session.metadata?.release_run}${b ? `, repeated session ${b.sessionId === a.sessionId ? "same" : "different"}, one order ${oneOrder}, expiry webhook ${webhook?.deliveredThroughListener}` : ""}`,
            buyer: name === "lost-response" ? { shown, afterExpiry: await adapter.buyerScreen(ctx, a, page, `${offer.id}-${name}`) } : shown,
            stripe: pick(session), webhook, stored: await adapter.storedRow(ctx, a) });
        } else if (["success", "decline", "block", "3ds-pass", "3ds-fail"].includes(name)) {
          const a = await adapter.open(ctx, offer, { page });
          const shouldPay = name === "success" || name === "3ds-pass";
          let hosted = null;
          await payHosted(page, a.url, CARDS[name], { threeDS: name.startsWith("3ds") ? name.slice(4) : null });
          if (shouldPay) {
            let back = false;
            for (let w = 0; w < 120 && !back; w++) { back = Boolean(page.returnedTo) || page.url().startsWith(preview); if (!back) await sleep(500); }
            if (!back) hosted = await buyerSaw(page, `${offer.id}-${name}-hosted`);
          }
          if (!shouldPay) { await sleep(6000); hosted = await buyerSaw(page, `${offer.id}-${name}-hosted`); }
          const session = await stripe("GET", `checkout/sessions/${a.sessionId}`);
          const webhook = shouldPay ? await eventFor("checkout.session.completed", (o) => o.id === a.sessionId, since)
            : await eventFor("payment_intent.payment_failed", o => o.metadata?.release_run === run &&
              (o.id === session.payment_intent || adapter.paymentFailureMatches?.(a, o)), since);
          if (shouldPay) {
            await sleep(2000);
            await adapter.settled?.(ctx, a);
          }
          const buyer = shouldPay ? await adapter.buyerScreen(ctx, a, page, `${offer.id}-${name}`) : await buyerSaw(page, `${offer.id}-${name}`);
          const stored = await adapter.storedRow(ctx, a);
          const ok = shouldPay
            ? session.status === "complete" && session.payment_status === "paid" && webhook?.deliveredThroughListener === 200 && adapter.isPaid(stored) && buyer.ok !== false
            : session.status === "open" && session.payment_status === "unpaid" && !adapter.isPaid(stored) && webhook?.deliveredThroughListener === 200;
          if (!shouldPay) await stripe("POST", `checkout/sessions/${a.sessionId}/expire`).catch(() => {});
          if (shouldPay && ok) paid.set(offer.id, { a, session });
          record(offer, name, { state: ok ? "passed" : "failed", why: ok ? undefined : `session ${session.status}/${session.payment_status}, webhook ${webhook?.deliveredThroughListener ?? "none"}, stored ${adapter.describe(stored)}`, buyer, hostedPage: hosted, stripe: pick(session), webhook, stored });
        } else if (name === "expire") {
          const a = await adapter.open(ctx, offer, { page });
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
          if (button) { await button.h.focus(); await page.keyboard.press("Enter"); }
          else {
            const buttons = await page.$$("button");
            let clicked = false;
            for (const b of buttons) {
              if (/cancel subscription/i.test(await b.evaluate((el) => el.textContent)) && await b.boundingBox()) {
                await b.focus(); await page.keyboard.press("Enter"); clicked = true; break;
              }
            }
            if (!clicked) throw new Error("The hosted portal showed no cancellation action");
          }
          const scheduled = (o) => o.cancel_at_period_end === true || (Number.isSafeInteger(o.cancel_at) && o.cancel_at > 0);
          const webhook = await eventFor("customer.subscription.updated", (o) => o.id === p.session.subscription && scheduled(o), since);
          const subscription = await stripe("GET", `subscriptions/${p.session.subscription}`);
          const stored = await adapter.storedRow(ctx, p.a);
          const buyer = await adapter.buyerScreen(ctx, p.a, page, `${offer.id}-cancel`);
          const ok = scheduled(subscription) && stored.cancel_at_period_end === true &&
            webhook.deliveredThroughListener === 200 && buyer.text.includes("will not renew");
          record(offer, name, { state: ok ? "passed" : "failed", buyer, stripe: { id: subscription.id, status: subscription.status, cancel_at_period_end: subscription.cancel_at_period_end, cancel_at: subscription.cancel_at }, webhook, stored });
        } else if (name === "receipt") {
          const p = paid.get(offer.id);
          if (!p) throw new Error("A receipt needs a passed hosted success payment first");
          const mail = await adapter.receiptMail(ctx, p.a);
          const ok = mail.accepted === 1 && mail.deferred === 0 && mail.messages?.length === 1 &&
            mail.messages[0].id === mail.stored.provider_id && Boolean(mail.stored.accepted_at);
          record(offer, name, { state: ok ? "passed" : "failed", buyer: await adapter.buyerScreen(ctx, p.a, page, `${offer.id}-receipt`),
            stripe: pick(p.session), mail, stored: await adapter.storedRow(ctx, p.a), why: ok ? undefined : "Receipt delivery was not confirmed" });
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
        record(offer, name, { state: "failed", why: e.message.slice(0, 300), form: e.form, buyer: await buyerSaw(page, `${offer.id}-${name}-error`).catch(() => ({ evidenceUnavailable: true })) });
      } finally { await page.close().catch(() => {}); }
    }
  }
} finally {
  await browser.close().catch(() => {});
  await shutdown();
  writeFileSync(join(out, "listener.log"), listenLog.replace(/whsec_[A-Za-z0-9]+/g, "whsec_<redacted>"));
}
const sourceUnchanged = git("rev-parse", "HEAD") === commit && !git("status", "--porcelain", "--untracked-files=no");
const summary = { run, commit, source, sourceUnchanged, lane, startedFor: offers.map((o) => o.id), cases, passed: records.filter((r) => r.state === "passed").length, failed: records.filter((r) => r.state === "failed").length, notRun: records.filter((r) => r.state === "not run").length, records: records.map(({ offer, case: c, state, why }) => ({ offer, case: c, state, why })) };
writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(`\n${summary.passed} passed, ${summary.failed} failed, ${summary.notRun} not run. Records in release/out/stripe/${run}/`);
process.exit(!sourceUnchanged || !records.length || summary.failed || summary.notRun ? 1 : 0);
