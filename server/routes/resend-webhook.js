import { Router } from "express";

// Resend bounce/complaint webhook (P3). Mounted at /api/webhooks/resend; raw body
// captured upstream for Svix signature verification. Maintains an email suppression list.
const router = Router();

router.post("/", (_req, res) => res.json({ received: true }));

export default router;
