import { Router } from "express";

// Stripe webhook — the authoritative "paid" signal. Mounted under /api/stripe, so the
// path is /api/stripe/webhook. The raw body is captured upstream (req.rawBody) BEFORE
// express.json(). Signature verification + idempotent fulfillment land in P4.
const router = Router();

router.post("/webhook", (_req, res) => res.json({ received: true }));

export default router;
