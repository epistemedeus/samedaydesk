import { Router } from "express";

// Intake uploads. Primary path is client-direct upload to Supabase Storage governed by
// per-user folder RLS. This route (P4) mints short-TTL signed DOWNLOAD urls so the
// operator can fetch a client's file, and is the fallback for payment-gated uploads.
const router = Router();

router.post("/signed-url", (_req, res) => res.status(501).json({ error: "Not implemented yet" }));

export default router;
