import { Router } from "express";
import { eventCounts } from "../lib/events.js";
import { classSeries } from "../lib/pulse.js";

// Admin-token metrics. K1 to K4 are the launch gates; S1 to S4 are the request-class
// series. The endpoint does not exist when the token is not configured, because a
// half-protected metrics endpoint is worse than none.
const router = Router();

router.get("/", (req, res) => {
  const token = process.env.ADMIN_METRICS_TOKEN;
  if (!token) return res.status(404).json({ error: "Not found" });
  const given = req.headers["x-metrics-token"] || "";
  if (given !== token) return res.status(404).json({ error: "Not found" });

  const counts = eventCounts();
  const series = classSeries(30);
  const sum = (cls) => Object.values(series).reduce((n, d) => n + (d[cls] || 0), 0);

  res.set("Cache-Control", "no-store");
  res.json({
    generated_at: new Date().toISOString(),
    window: "process lifetime for K counters, last 30 days for S series",
    k: {
      K1_report_delivered: counts.report_delivered || 0,
      K2_report_delivered_with_panel: counts.report_delivered_with_panel || 0,
      K3_audit_checkout_started: counts.audit_checkout_started || 0,
      K4_audit_paid: counts.audit_paid || 0,
    },
    s: {
      S1_crawler: sum("A"),
      S2_agent_fetch: sum("B"),
      S3_human_from_ai_surface: sum("C"),
      S4_human_source_unknown: sum("D"),
      unresolved: sum("E"),
    },
    events: counts,
    class_days: series,
    note: "K counters are process local and reset on redeploy. PostHog holds the durable copy when a key is configured.",
  });
});

export default router;
