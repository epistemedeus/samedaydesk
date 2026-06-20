import { Router } from "express";

// Stripe checkout (Payment Element). Implemented in P4:
//  - POST /create-payment-intent  (requireAuth → server-authoritative pricing → PaymentIntent w/ metadata)
//  - POST /verify                 (verify-on-return → idempotent fulfill)
const router = Router();

router.post("/create-payment-intent", (_req, res) => res.status(501).json({ error: "Not implemented yet" }));
router.post("/verify", (_req, res) => res.status(501).json({ error: "Not implemented yet" }));

export default router;
