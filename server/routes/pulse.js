import { Router } from "express";
import { pulseSnapshot, recordClientEvent } from "../lib/pulse.js";

const router = Router();

// Aggregate, non-PII traffic snapshot. Token-gated only to keep it out of casual
// view; the data is low-sensitivity (no personal data, just counts + referers).
const TOKEN = process.env.PULSE_TOKEN || "p7f3a9c2e";

router.get("/", (req, res) => {
  if ((req.query.k || "") !== TOKEN) return res.status(404).json({ error: "Not found" });
  res.set("Cache-Control", "no-store");
  res.json(pulseSnapshot());
});

router.post("/event", (req, res) => {
  // Public and deliberately credential-free. Accepted rows are bounded,
  // anonymous diagnostic signals and carry no identity or demand authority.
  if (!recordClientEvent(req.body?.event, req.body?.props)) {
    return res.status(400).json({ error: "Unsupported event" });
  }
  return res.status(204).end();
});

export default router;
