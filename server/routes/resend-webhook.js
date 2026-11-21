import { Router } from "express";
import { Resend } from "resend";
import { saveMailEvent } from "../lib/mail-events.js";

// Verification is local; this placeholder never authorizes an API request.
const verifier = new Resend("signature-verification-only").webhooks;
const types = new Set(["email.delivered", "email.bounced", "email.complained", "email.failed", "email.suppressed"]);
export function createResendWebhookRouter({ store = saveMailEvent } = {}) {
  const router = Router();
  router.post("/", async (req, res) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ error: "Mail webhook is not configured" });
    const id = req.headers["svix-id"];
    let event;
    try {
      if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(id) || !Buffer.isBuffer(req.rawBody)) throw new Error();
      event = verifier.verify({ payload: req.rawBody.toString("utf8"), webhookSecret: secret,
        headers: { id, timestamp: req.headers["svix-timestamp"], signature: req.headers["svix-signature"] } });
    } catch { return res.status(400).json({ error: "Invalid mail signature" }); }
    if (!types.has(event.type)) return res.json({ received: true, ignored: true });
    if (typeof event.data?.email_id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(event.data.email_id)) {
      return res.status(400).json({ error: "Invalid mail event" });
    }
    try {
      await store({ event_id: id, email_id: event.data.email_id, event_type: event.type,
        test: process.env.SDS_PRIVATE_PREVIEW === "1" });
      return res.json({ received: true });
    } catch { return res.status(503).json({ error: "Mail event was not stored" }); }
  });
  return router;
}

export default createResendWebhookRouter();
