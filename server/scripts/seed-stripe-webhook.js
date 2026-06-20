// Idempotent seeder for the SameDayDesk Stripe webhook endpoint.
// Run: node --env-file=.env server/scripts/seed-stripe-webhook.js
//
// Mode follows STRIPE_SECRET_KEY: a test key (sk_test_…) creates the TEST endpoint,
// a live key (sk_live_…) creates the LIVE endpoint — same script for both.
// The signing secret (whsec_…) is returned by Stripe ONLY at creation time, so this
// prints it on first create. Copy it into the host (Hostinger) env as STRIPE_WEBHOOK_SECRET
// and redeploy. Re-running when the endpoint already exists reconciles the event list but
// cannot re-reveal the secret — pass `--roll` to delete + recreate and reveal a fresh one.
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// The webhook always targets the live, publicly-reachable site (never the local PUBLIC_URL,
// which is a localhost dev value). Override only if the prod domain changes.
const BASE = (process.env.WEBHOOK_BASE_URL || "https://samedaydesk.com").replace(/\/$/, "");
const URL = `${BASE}/api/stripe/webhook`;
// Must match the events handled in server/routes/stripe-webhook.js
const EVENTS = ["payment_intent.succeeded", "checkout.session.completed"];
const roll = process.argv.includes("--roll");

async function listAll() {
  const out = [];
  for await (const e of stripe.webhookEndpoints.list({ limit: 100 })) out.push(e);
  return out;
}

function reveal(ep, mode) {
  console.log(`[${mode}] ${ep.id}  (${ep.status})`);
  console.log(`  url:    ${ep.url}`);
  console.log(`  events: ${ep.enabled_events.join(", ")}`);
  console.log(`\n  STRIPE_WEBHOOK_SECRET=${ep.secret}`);
  console.log(`\n  ^ set this in the Hostinger env and redeploy.`);
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  const mode = key.startsWith("sk_live") ? "LIVE" : "TEST";

  const existing = (await listAll()).find((e) => e.url === URL);

  if (!existing) {
    const ep = await stripe.webhookEndpoints.create({
      url: URL,
      enabled_events: EVENTS,
      description: "SameDayDesk prod webhook (Hostinger)",
    });
    reveal(ep, mode);
    return;
  }

  if (roll) {
    await stripe.webhookEndpoints.del(existing.id);
    const ep = await stripe.webhookEndpoints.create({
      url: URL,
      enabled_events: EVENTS,
      description: "SameDayDesk prod webhook (Hostinger)",
    });
    console.log(`[${mode}] rolled secret (deleted ${existing.id}, created ${ep.id})`);
    reveal(ep, mode);
    return;
  }

  const missing = EVENTS.filter((e) => !existing.enabled_events.includes(e));
  if (missing.length) {
    await stripe.webhookEndpoints.update(existing.id, { enabled_events: EVENTS });
    console.log(`[${mode}] ${existing.id} — added events: ${missing.join(", ")}`);
  } else {
    console.log(`[${mode}] ${existing.id} already up to date (${existing.url}).`);
  }
  console.log("  Secret is only shown at creation. Re-run with --roll to delete + recreate and reveal a fresh one.");
  console.log("  (Any STRIPE_WEBHOOK_SECRET already set in Hostinger stays valid.)");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
