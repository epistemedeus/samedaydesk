import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Smoke test for the auth wiring: echoes the identity derived from the verified token.
router.get("/me", requireAuth, (req, res) => {
  res.json({ uid: req.uid, email: req.userEmail, emailVerified: req.emailVerified });
});

export default router;
