import { Router } from "express";
import { isSupabaseConfigured } from "../lib/supabase-admin.js";
import { isStripeConfigured } from "../lib/stripe.js";
import { isEmailConfigured } from "../lib/resend.js";

const router = Router();

router.get("/health", (_req, res) => {
  if (process.env.SDS_PRIVATE_PREVIEW === "1" && /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || "")) {
    res.set("X-SDS-Private-Source", process.env.GITHUB_SHA);
  }
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
