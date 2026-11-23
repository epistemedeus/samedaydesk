import { Router } from "express";
import { CareError } from "../lib/care-contract.js";
import { reportRequestError } from "../lib/journey-events.js";

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
      void reportRequestError("care_request");
      return res.status(503).json({ error: "We could not complete that step. Please try the same request again." });
    }
  };
  const escape = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  router.get("/quote/:key", async (req,res) => {
    try {
      const quote = await care.selectQuote(req.params.key);
      if (req.accepts(["html","json"]) === "json") return res.json(quote);
      const cents = BigInt(quote.cents);
      const form = (method,label) => `<form method="post" action="./${escape(req.params.key)}/${method}"><button>${label}</button></form>`;
      const allowed = quote.state === "choice" ? ["stripe","usdc"] : [quote.state];
      res.set("Content-Security-Policy","default-src 'none'; base-uri 'none'; form-action 'self' https://buy.stripe.com https://agents.samedaydesk.com; frame-ancestors 'none'");
      return res.type("html").send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Your SameDayDesk quote</title><main><h1>Your SameDayDesk quote</h1><p>${escape(quote.scope)}</p>
        <p>Acceptance check: ${escape(quote.acceptance)}</p><p>Total: ${cents/100n}.${String(cents%100n).padStart(2,"0")} USD</p>
        ${allowed.includes("stripe") ? form("stripe","Pay by card") : ""}${allowed.includes("usdc") ? form("usdc","Pay with USDC") : ""}
        ${quote.paymentUrl ? `<p><a href="${escape(quote.paymentUrl)}/wallet">View payment and receipt</a></p>` : ""}
        ${quote.state === "paid" ? "<p>Paid.</p>" : ""}<p>Quote reference: ${escape(quote.reference)}</p></main></html>`);
    } catch (error) { return res.status(error instanceof CareError ? error.status : 503).send("Quote unavailable."); }
  });
  router.post("/quote/:key/:method", async (req,res) => {
    try {
      if (!["usdc","stripe"].includes(req.params.method)) return res.sendStatus(404);
      const result = await care.selectQuote(req.params.key,req.params.method);
      if (req.accepts(["html","json"]) === "json") return res.json(result);
      return res.redirect(303,result.url ?? result.paymentUrl + "/wallet");
    } catch (error) { return res.status(error instanceof CareError ? error.status : 503).send("Check your original quote before continuing."); }
  });
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
    const method = req.body?.method ?? "card";
    if (method === "base_usdc") return care.startUsdc(req.body?.offer, req.body?.order, req.body?.email, req.journeySession);
    return method === "card" ? care.start(req.body?.offer, req.body?.order, req.journeySession)
      : care.startInvoice(req.body?.offer, req.body?.order, method, req.body?.email, req.journeySession);
  }));
  // Card always; bank transfer and stablecoin for the monthly offer only when SDS_CARE_NONCARD is on.
  router.post("/methods", route((req) => ({ methods: care.methods(req.body?.offer) })));
  router.post("/receipt", route((req) => care.read(req.body?.order, req.body?.key)));
  router.post("/intake", route((req) => care.submit(req.body?.order, req.body?.key, req.body?.intake)));
  router.post("/subscription", route((req) => care.portal(req.body?.order, req.body?.key)));
  return router;
}
