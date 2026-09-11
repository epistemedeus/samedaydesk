#!/usr/bin/env node
/**
 * Local-runtime capture of checkout verify → fulfillmentPending / intake_required.
 * Mirrors server/scripts/test-checkout-http-lifecycle.js:108-118 without calling
 * live Stripe or sending receipts. Fixture-class Stripe keys only.
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import express from "express";
import { SignJWT } from "jose";
import { packDossier } from "./pack.mjs";

process.env.SUPABASE_JWT_SECRET ||= "fixture-only-local-jwt-secret-32bytes";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "fixture-service-role";
process.env.STRIPE_SECRET_KEY ||= "sk_test_fixture_not_a_real_key";
process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_fixture_not_a_real_secret";
delete process.env.RESEND_API_KEY;

export async function captureCheckoutIntakeHttp() {
  const orders = new Map();
  const provider = express();
  provider.use(express.json());
  provider.get("/auth/v1/.well-known/jwks.json", (_req, res) => res.json({ keys: [] }));
  provider.all("/rest/v1/:table", (req, res) => {
    if (req.params.table === "drafts") return res.json({ data: { details: "Later task B" }, upload_path: "later-task.pdf" });
    if (req.params.table === "profiles") return res.json([]);
    if (req.params.table !== "orders") return res.status(404).json({ error: "unexpected table" });
    if (req.method === "POST") {
      const row = req.body;
      if (orders.has(row.stripe_payment_intent)) return res.status(201).json([]);
      orders.set(row.stripe_payment_intent, row);
      return res.status(201).json([{ id: row.id }]);
    }
    const pi = String(req.query.stripe_payment_intent || "").replace(/^eq\./, "");
    return res.json({ id: orders.get(pi)?.id });
  });
  const providerServer = provider.listen(0, "127.0.0.1");
  await new Promise((resolve) => providerServer.once("listening", resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${providerServer.address().port}`;

  let server;
  try {
    const { stripe } = await import("../../../server/lib/stripe.js");
    const { paymentAttemptStoreDeps, createMemoryPaymentAttemptStore } = await import(
      "../../../server/lib/payment-attempt-store.js"
    );
    const store = createMemoryPaymentAttemptStore();
    paymentAttemptStoreDeps.getStore = () => store;
    const intents = new Map();
    const keys = new Map();
    stripe.paymentIntents.create = async (params, { idempotencyKey }) => {
      if (keys.has(idempotencyKey)) return intents.get(keys.get(idempotencyKey));
      const intent = {
        id: `pi_dossier_${keys.size + 1}`,
        client_secret: `fixture_secret_${keys.size + 1}`,
        ...params,
        status: "requires_payment_method",
      };
      keys.set(idempotencyKey, intent.id);
      intents.set(intent.id, intent);
      return intent;
    };
    stripe.paymentIntents.retrieve = async (id) => intents.get(id);

    const { default: checkout } = await import("../../../server/routes/checkout.js");
    const app = express();
    app.use(express.json());
    app.use("/api/checkout", checkout);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const token = await new SignJWT({ email: "buyer@example.test", email_verified: true })
      .setSubject("00000000-0000-0000-0000-000000000001")
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET));

    const post = async (path, body) => {
      const response = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };

    const created = await post("/api/checkout/create-payment-intent", { offer: "agent_mcp_server" });
    if (created.status !== 200) {
      throw new Error(`create-payment-intent failed: ${JSON.stringify(created)}`);
    }
    intents.get(created.body.paymentIntentId).status = "succeeded";
    const verified = await post("/api/checkout/verify", { paymentIntentId: created.body.paymentIntentId });
    const order = orders.get(created.body.paymentIntentId);
    return {
      class: "local-runtime",
      http: { method: "POST", path: "/api/checkout/verify", status: verified.status },
      verify: verified.body,
      order,
    };
  } finally {
    if (server) {
      server.closeAllConnections?.();
      server.close();
    }
    providerServer.closeAllConnections?.();
    providerServer.close();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const capture = await captureCheckoutIntakeHttp();
  const packed = packDossier({
    items: [
      {
        sourceKind: "checkout-intake",
        originClass: "local-runtime",
        http: capture.http,
        body: { verify: capture.verify, order: capture.order },
      },
    ],
  });
  process.stdout.write(`${JSON.stringify({ capture, packed }, null, 2)}\n`);
  process.exit(capture.verify?.fulfillmentPending === true && packed.ok ? 0 : 2);
}
