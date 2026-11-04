import { Router } from "express";
import crypto from "node:crypto";
import { flushPulseSnapshot, pulseSnapshot, recordClientEvent } from "../lib/pulse.js";

const router = Router();

// Aggregate, non-PII traffic snapshot. Reads require a configured token.
// Event writes stay public and credential-free.
function configuredPulseToken() {
  const value = process.env.PULSE_TOKEN;
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (token.length < 16) return null;
  return token;
}

function presentedTokenMatches(presented, expected) {
  if (typeof presented !== "string") return false;
  const left = Buffer.from(presented, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

router.get("/", (req, res) => {
  res.set("Cache-Control", "no-store");
  const token = configuredPulseToken();
  if (token === null) {
    return res.status(503).json({ error: "Pulse read unconfigured" });
  }
  if (!presentedTokenMatches(req.query.k, token)) {
    return res.status(404).json({ error: "Not found" });
  }
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
