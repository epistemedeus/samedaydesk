import { Router } from "express";
import { isSupabaseConfigured } from "../lib/supabase-admin.js";
import { isStripeConfigured } from "../lib/stripe.js";
import { isEmailConfigured } from "../lib/resend.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "samedaydesk",
    time: new Date().toISOString(),
    configured: {
      supabase: isSupabaseConfigured(),
      stripe: isStripeConfigured(),
      email: isEmailConfigured(),
    },
  });
});

export default router;
