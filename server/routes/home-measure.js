import { Router } from "express";

// Token-gated aggregate read for the homepage sidecar. The endpoint does not
// exist when the token is unset, because a half-protected counter is worse
// than none. The body is daily integers plus a static legend. No IP, user
// agent, cookie, or identity field is ever included.
export function createHomeMeasureRouter(measure) {
  const router = Router();
  router.get("/", (req, res) => {
    const token = process.env.HOMEPAGE_MEASURE_TOKEN;
    if (!token) return res.status(404).json({ error: "Not found" });
    const given = req.headers["x-homepage-measure-token"] || req.query.k || "";
    if (given !== token) return res.status(404).json({ error: "Not found" });
    res.set("Cache-Control", "no-store");
    res.json(measure.snapshot());
  });
  return router;
}
