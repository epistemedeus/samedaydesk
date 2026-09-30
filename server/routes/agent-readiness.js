import { Router } from "express";
import { compareBaseline, loadBaseline } from "../../tools/agent-readiness/baseline.mjs";
import { probeOrigin } from "../../tools/agent-readiness/probe.mjs";
import { scoreCapture } from "../../tools/agent-readiness/score.mjs";

// Free agent-readiness tool. Reads public discovery, MCP, CORS, x402, and
// agent-card documents. It does not pay, sign, or call a paid route body.
const router = Router();

router.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

router.get("/baseline", (_req, res) => {
  const compared = compareBaseline();
  if (!compared.ok) {
    return res.status(500).json({ error: "Baseline drift", mismatches: compared.mismatches, paid: false });
  }
  res.json({ ...loadBaseline(), paid: false, recomputed: true });
});

router.get("/", async (req, res) => {
  const raw = req.query.url;
  if (!raw || typeof raw !== "string") {
    return res.status(400).json({ error: "Pass a url query parameter", paid: false });
  }
  try {
    const probed = await probeOrigin(raw);
    const report = scoreCapture({
      id: probed.origin,
      label: probed.origin,
      origin: probed.origin,
      role: "public",
      heldOut: false,
      responses: probed.responses,
    });
    res.json({ ...report, probeErrors: probed.errors, checkedAt: new Date().toISOString() });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message || "Could not check that site", paid: false });
  }
});

export default router;
