import { Router } from "express";
import { flushPulseSnapshot, pulseSnapshot, recordClientEvent } from "../lib/pulse.js";
import { journeySnapshot, recordJourney, reportRequestError } from "../lib/journey-events.js";

const router = Router();

// Aggregate, non-PII traffic snapshot. Token-gated only to keep it out of casual
// view; the data is low-sensitivity (no personal data, just counts + referers).
const TOKEN = process.env.PULSE_TOKEN || "p7f3a9c2e";

router.get("/journey", (req, res) => {
  if (!process.env.PULSE_TOKEN || req.query.k !== process.env.PULSE_TOKEN) return res.status(404).end();
  res.set("Cache-Control", "no-store").json(journeySnapshot());
});
const limits = new Map();
router.post("/journey", (req, res) => {
  const now = Date.now();
  for (const [key, row] of limits) if (row.until < now) limits.delete(key);
  const row = limits.get(req.ip) || { until: now + 60_000, count: 0 };
  if (limits.size >= 1024 && !limits.has(req.ip) || ++row.count > 180) return res.status(429).end();
  limits.set(req.ip, row);
  if (!recordJourney(req.body?.event, req.body?.props)) return res.status(400).json({ error: "Unsupported event" });
  res.status(204).end();
});
router.post("/error", (req, res) => {
  // Fixed code only: never forward an exception, browser URL or request body.
  if (req.body?.code !== "browser_runtime") return res.status(400).end();
  void reportRequestError("browser_runtime");
  res.status(204).end();
});

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
  if (!flushPulseSnapshot()) {
    return res.status(503).json({ error: "Telemetry unavailable" });
  }
  return res.status(204).end();
});

export default router;
