import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { sendWelcome, notifyAdmin } from "../lib/notify.js";

const router = Router();

// Smoke test for the auth wiring: echoes the identity derived from the verified token.
router.get("/me", requireAuth, (req, res) => {
  res.json({ uid: req.uid, email: req.userEmail, emailVerified: req.emailVerified });
});

// Fire-and-forget welcome + admin signup notification (called once by the client after signup).
router.post("/welcome", requireAuth, async (req, res) => {
  sendWelcome({ to: req.userEmail }).catch(() => {});
  notifyAdmin("New SameDayDesk signup", `<p>New account: <strong>${req.userEmail}</strong></p>`).catch(() => {});
  res.json({ ok: true });
});

export default router;
