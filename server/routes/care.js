import { Router } from "express";
import { CareError } from "../lib/care-contract.js";

export function createCareRouter(care, clock = Date.now) {
  const router = Router();
  const byIp = new Map();
  router.use((_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    next();
  });
  const route = (fn) => async (req, res) => {
    if (!care) return res.status(503).json({ error: "This checkout is not yet available." });
    try { return res.json(await fn(req)); }
    catch (error) {
      if (error instanceof CareError) return res.status(error.status).json({ error: error.message, code: error.code });
      console.error("[care] request failed", error?.type || error?.name || "Error");
      return res.status(503).json({ error: "We could not complete that step. Please try the same request again." });
    }
  };
  router.post("/checkout", route((req) => {
    const now = clock();
    if (byIp.size >= 1024) for (const [ip, limit] of byIp) if (limit.until <= now) byIp.delete(ip);
    let limit = byIp.get(req.ip);
    if (!limit || limit.until <= now) {
      if (!limit && byIp.size >= 1024) throw new CareError(429, "Please try again in a minute.");
      limit = { count: 0, until: now + 60_000 };
      byIp.set(req.ip, limit);
    }
    if (++limit.count > 12) throw new CareError(429, "Please try again in a minute.");
    return care.start(req.body?.offer, req.body?.order);
  }));
  router.post("/receipt", route((req) => care.read(req.body?.order, req.body?.key)));
  router.post("/intake", route((req) => care.submit(req.body?.order, req.body?.key, req.body?.intake)));
  router.post("/subscription", route((req) => care.portal(req.body?.order, req.body?.key)));
  return router;
}
