import { OrderRailConflict } from "../vendor/order-payments/site-state.mjs";
import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { CareError, isOrderId } from "../lib/care-contract.js";

export function orderPaymentsRouter(store, token, admin = false) {
  const router = Router();
  router.post("/:id/:action", async (req, res) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    const actual = Buffer.from(req.get("authorization") || "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (!store || typeof token !== "string" || token.length < 32 || actual.length !== expected.length ||
        !timingSafeEqual(expected, actual) || !isOrderId(req.params.id) ||
        !(admin ? ["read","reserve","bind"] : ["load","arm","anchor","submitted","observe","refund-observe","review-register","review-read","review-observe"]).includes(req.params.action)) return res.sendStatus(404);
    try { return res.json(await store.change(req.params.id, admin ? "refund-" + req.params.action : req.params.action, req.body || {})); }
    catch (e) { return res.status((e instanceof CareError || e instanceof OrderRailConflict) ? e.status : 503).json({ error: "order_update_unavailable" }); }
  });
  return router;
}
