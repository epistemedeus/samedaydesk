import { Router } from "express";
import { pulseSnapshot } from "../lib/pulse.js";

const router = Router();

// Aggregate, non-PII traffic snapshot. Token-gated only to keep it out of casual
// view; the data is low-sensitivity (no personal data, just counts + referers).
const TOKEN = process.env.PULSE_TOKEN || "p7f3a9c2e";

router.get("/", (req, res) => {
  if ((req.query.k || "") !== TOKEN) return res.status(404).json({ error: "Not found" });
  res.set("Cache-Control", "no-store");
  res.json(pulseSnapshot());
});

export default router;
