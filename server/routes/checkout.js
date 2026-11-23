import legacyCheckout from "./legacy-checkout.js";
import { readReportCheckout, reportCheckoutEnabled, reportCheckoutPage, startReportCheckout } from "../lib/report-order.js";
import { accountUsdc } from "../lib/account-usdc.js";
import { CareError } from "../lib/care-contract.js";
import { Router } from "express";
import { requireAuth, requireVerifiedEmail } from "../middleware/auth.js";
import { stripe, isStripeConfigured } from "../lib/stripe.js";
import { fulfillFromIntent } from "../lib/fulfill.js";
import { createSellerRepairCheckoutSession, isValidSellerRepairFindingId } from "../lib/seller-repair-checkout.js";
import { createOfferPaymentIntent, preparePaymentIntake } from "../lib/payment-attempt.js";

const router = Router();
router.use(legacyCheckout);
export const accountOrderRail = () => accountUsdc({ stripe, enabled: process.env.SDS_ORDER_USDC === "1" &&
  (process.env.ORDER_PAYMENTS_SDS_TOKEN?.length ?? 0) >= 32, live: process.env.SDS_PRIVATE_PREVIEW !== "1" });
router.post("/usdc", requireAuth, requireVerifiedEmail, async (req,res) => {
  try { return res.json(await accountOrderRail().start({ uid: req.uid, paymentAttemptId: req.body?.payment_attempt_id, intake: req.body?.intake })); }
  catch (error) { return res.status(error instanceof CareError ? error.status : 503).json({ error: "Check this order before continuing payment." }); }
});

// The same report link is already published on Neomorphic. Preview never sends
// a user to that live link. The target is entered in Stripe's public-target field.
router.get("/seller-conformance", (req, res) => {
  res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  if (reportCheckoutEnabled(process.env) && req.query.card !== "1") {
    if (req.accepts(["html","json"]) === "json") return res.json({ priceCents:49000, currency:"usd", methods:["card","base_usdc"],
      create:"/api/checkout/seller-conformance/order", usdc:{network:"eip155:8453",fields:["order","email","publicOrigin","getRoute","authorized"]} });
    return res.type("html").send(reportCheckoutPage);
  }
  const preview = process.env.SDS_PRIVATE_PREVIEW === "1";
  const configured = preview ? process.env.SDS_TEST_SELLER_CONFORMANCE_LINK : "https://buy.stripe.com/7sY00keoqbLN899282eZ20F";
  try {
    const link = new URL(configured);
    if (link.origin !== "https://buy.stripe.com" || link.username || link.password ||
        link.pathname.startsWith("/test_") !== preview || link.search || link.hash) throw new Error("wrong Stripe link");
    if (isValidSellerRepairFindingId(req.query.finding)) link.searchParams.set("client_reference_id", req.query.finding);
    return res.redirect(303, link.href);
  } catch { return res.status(503).json({ error: "The report checkout is not available." }); }
});

router.post("/seller-conformance/order/status", async (req, res) => {
  res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  if (!reportCheckoutEnabled(process.env)) return res.sendStatus(404);
  try {
    const { status, body } = await readReportCheckout(req.body?.order);
    return res.status(status).json(body);
  } catch { return res.status(503).json({ error: "Check the status of your report order." }); }
});

router.post("/seller-conformance/order", async (req,res) => {
  res.set({"Cache-Control":"no-store","Referrer-Policy":"no-referrer"});
  if (!reportCheckoutEnabled(process.env)) return res.sendStatus(404);
  try {
    const result = await startReportCheckout(req.body);
    return res.status(result.status).json(result.body);
  } catch { return res.status(503).json({error:"Check this report order before continuing payment."}); }
});

// Server-authoritative PaymentIntent. The client sends an offer SLUG only — the amount is
// computed here and stamped into metadata, which fulfillment reads back (never the client).
// Duplicate creates for the same server-owned payment_attempt_id reuse one Stripe idempotency key.
router.post("/create-payment-intent", requireAuth, requireVerifiedEmail, async (req, res) => {
  if (!isStripeConfigured()) return res.status(503).json({ error: "Payments not configured" });
  const slug = req.body?.offer;
  const uploadPath = typeof req.body?.upload_path === "string" ? req.body.upload_path : "";
  const paymentAttemptId = typeof req.body?.payment_attempt_id === "string"
    ? req.body.payment_attempt_id.trim()
    : null;

  try {
    const result = await createOfferPaymentIntent({
      stripeClient: stripe,
      uid: req.uid,
      email: req.userEmail,
      offerSlug: slug,
      uploadPath,
      paymentAttemptId: paymentAttemptId || null,
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    if (result.rail) return res.json({ rail: result.rail, paymentAttemptId: result.attemptId, intakeSnapshot: result.intakeSnapshot,
      usdcAvailable: true, ...(result.rail === "usdc" && { paymentUrl: "https://agents.samedaydesk.com/order-payments/sds/" + result.railId }) });
    const { intent, offer, attemptId } = result;
    res.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      paymentAttemptId: attemptId,
      usdcAvailable: process.env.SDS_ORDER_USDC === "1" && (process.env.ORDER_PAYMENTS_SDS_TOKEN?.length ?? 0) >= 32,
      amount: offer.amount,
      label: offer.label,
      intakeSnapshot: result.intakeSnapshot || null,
    });
  } catch (e) {
    console.error("[checkout] create-payment-intent", e?.message);
    res.status(502).json({ error: "Could not start checkout" });
  }
});

router.post("/prepare-payment", requireAuth, requireVerifiedEmail, async (req, res) => {
  if (!isStripeConfigured()) return res.status(503).json({ error: "Payments not configured" });
  try {
    const result = await preparePaymentIntake({
      stripeClient: stripe, uid: req.uid,
      paymentAttemptId: req.body?.payment_attempt_id, intake: req.body?.intake,
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json({ prepared: true, intakeSnapshot: result.intakeSnapshot });
  } catch (error) {
    console.error("[checkout] prepare-payment", error?.message);
    return res.status(502).json({ error: "Could not freeze your task. Payment has not been confirmed." });
  }
});

// Verify-on-return (webhook backup). Both paths run the same idempotent fulfill().
router.post("/verify", requireAuth, requireVerifiedEmail, async (req, res) => {
  if (!isStripeConfigured()) return res.status(503).json({ error: "Payments not configured" });
  const id = req.body?.paymentIntentId;
  if (!id) return res.status(400).json({ error: "Missing paymentIntentId" });
  try {
    const intent = await stripe.paymentIntents.retrieve(id);
    if (intent.metadata?.uid !== req.uid) return res.status(403).json({ error: "Not your payment" });
    if (intent.status !== "succeeded") return res.json({ verified: false, status: intent.status });
    const result = await fulfillFromIntent(intent);
    res.json({ verified: true, orderId: result.orderId, fulfillmentPending: result.fulfillmentPending,
      ...(result.fulfillmentPending ? { reason: "Payment received; task intake needs reconciliation. Contact support before delivery." } : {}),
    });
  } catch (e) {
    console.error("[checkout] verify", e?.message);
    res.status(502).json({ error: "Could not verify payment" });
  }
});

// Unauthenticated hosted Checkout for the fixed seller-contract-repair offer.
// Accepts only a bounded public brief finding ID; amount and label are server-owned.
router.post("/seller-repair-session", async (req, res) => {
  const findingId = req.body?.finding_id;
  try {
    if (req.body?.order || req.body?.method === "base_usdc") {
      const care = req.app.get("sdsCare");
      if (!care) return res.sendStatus(503);
      return res.json(await care.startRepair({ order:req.body.order,findingId,email:req.body.email,
        method:req.body.method === "base_usdc" ? "usdc" : (!req.body.method || req.body.method === "card") ? "stripe" : null }));
    }
    if (!isStripeConfigured()) return res.status(503).json({ error: "Payments not configured" });
    const result = await createSellerRepairCheckoutSession(findingId);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json({ url: result.url });
  } catch (e) {
    if (e instanceof CareError) return res.status(e.status).json({ error:e.message });
    console.error("[checkout] seller-repair-session", e?.message);
    return res.status(502).json({ error: "Could not start checkout" });
  }
});

export default router;
