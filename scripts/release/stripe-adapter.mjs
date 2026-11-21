// SameDayDesk's side of scripts/release/stripe-matrix.mjs: the care checkout (one-time services and
// the Keep it working subscription) on the built Node app, with a throwaway local PostgreSQL for
// care_orders and the private preview mail outbox (no mail leaves the machine).
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pg, dsn, server, scratch, accessSecret, careLink;

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
  dsn = `postgresql://${os.userInfo().username}@/postgres?host=${encodeURIComponent(scratch)}&port=${pgPort}`;
  for (const m of ["0008_task_requests.sql", "0009_care_orders.sql", "0010_task_quotes.sql"]) {
    execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", dsn, "-f", join(root, "supabase/migrations", m)], { stdio: "ignore" });
  }
  server = spawn(process.execPath, ["server/index.js"], {
    cwd: root, stdio: ["ignore", "pipe", "pipe"],
    env: {
      PATH: process.env.PATH, HOME: scratch, NODE_ENV: "production", PORT: String(port),
      SDS_PRIVATE_PREVIEW: "1", SDS_CARE_CHECKOUT: "1", SDS_CARE_DATABASE_URL: dsn,
      SDS_CARE_ORIGIN: `http://127.0.0.1:${port}`, SDS_CARE_ACCESS_SECRET: accessSecret,
      STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: webhookSecret, RELEASE_RUN: run,
      SDS_PREVIEW_MAIL_OUTBOX: join(scratch, "outbox.jsonl"), ADMIN_EMAIL: "desk@example.test",
      SDS_RECEIPTS_SNAPSHOT_PATH: join(scratch, "receipt-snapshot.json"),
    },
  });
  let log = "";
  server.stdout.on("data", (c) => { log = (log + c).slice(-4000); });
  server.stderr.on("data", (c) => { log = (log + c).slice(-4000); });
  for (let i = 0; i < 60; i++) {
    await sleep(500);
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
  await page.goto(`${ctx.preview}${offer.entry}`, { waitUntil: "networkidle2" });
  const text = await page.$$eval("button", (bs) => bs.map((b) => b.textContent).join("\n"));
  const m = text.match(/Continue to pay ([\d,]+(?:\.\d\d)?) USD/);
  const cents = m ? Math.round(Number(m[1].replace(/,/g, "")) * 100) : null;
  return { page: offer.entry, label: m?.[0] ?? null, cents };
}

// The same call the buy page makes. `again` repeats it for the same order (a lost response).
export async function open(ctx, offer, { again } = {}) {
  const order = again?.order ?? randomUUID();
  const res = await fetch(`${ctx.preview}/api/care/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offer: offer.offer, order }) });
  const body = await res.json();
  if (!res.ok || !body.url) throw new Error(`checkout answered ${res.status}: ${body.error ?? "no url"}`);
  const sessionId = psql(`select session_id from care_orders where id = '${order}'`);
  return { order, url: body.url, sessionId };
}

export async function storedRow(_ctx, a) {
  const row = psql(`select row_to_json(o) from (select id, offer, amount_cents, live_mode, state, session_id, payment_intent_id is not null as has_payment, subscription_id is not null as has_subscription, refunded_cents from care_orders where id = '${a.order}') o`);
  return row ? JSON.parse(row) : null;
}
export async function orderCount(_ctx, a) {
  return Number(psql(`select count(*) from care_orders where session_id = '${a.sessionId}'`));
}
export const isPaid = (row) => row?.state === "paid";
export const isExpired = (row) => row?.state === "expired";
export const isRefunded = (row) => row?.state === "refunded" && row.refunded_cents === row.amount_cents;
export const describe = (row) => row ? `${row.state}, refunded ${row.refunded_cents}` : "no row";
export const comparable = (row) => row && { state: row.state, session_id: row.session_id, refunded_cents: row.refunded_cents, has_payment: row.has_payment };

// The buyer's receipt page, reached by the success URL (its capability key stays in the fragment).
export async function buyerScreen(ctx, a, page, name) {
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
