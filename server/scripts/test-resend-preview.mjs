import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { previewResend } from "../lib/resend.js";
import { createResendWebhookRouter } from "../routes/resend-webhook.js";

test("external preview mail cannot send to a customer, through cc/bcc, or under another brand", async () => {
  const sent = [];
  const client = previewResend({ emails: { async send(message) { sent.push(message); return { data: { id: "accepted" } }; } } });
  const base = { from: "SameDayDesk <contact@samedaydesk.com>", to: "delivered@resend.dev", subject: "Test" };
  for (const to of ["delivered@resend.dev", "bounced@resend.dev", "complained@resend.dev", "contact@samedaydesk.com"]) {
    assert.equal((await client.emails.send({ ...base, to })).data.id, "accepted");
  }
  for (const extra of [{ to: "buyer@example.com" }, { to: [base.to, "buyer@example.com"] },
    { cc: "buyer@example.com" }, { bcc: ["buyer@example.com"] }, { from: "desk@other.example" }, { replyTo: "desk@other.example" }]) {
    assert.ok((await client.emails.send({ ...base, ...extra })).error);
  }
  assert.equal(sent.length, 4);
});

test("mail webhooks verify signed raw bytes and report an unconfirmed store without retry", async (t) => {
  const key = randomBytes(32), secret = "whsec_" + key.toString("base64");
  const before = process.env.RESEND_WEBHOOK_SECRET;
  process.env.RESEND_WEBHOOK_SECRET = secret;
  t.after(() => before === undefined ? delete process.env.RESEND_WEBHOOK_SECRET : process.env.RESEND_WEBHOOK_SECRET = before);
  const received = [];
  const app = express();
  app.use(express.raw({ type: "application/json" }), (req, _res, next) => { req.rawBody = req.body; next(); });
  app.use(createResendWebhookRouter({ store: async (row) => { received.push(row); if (row.email_id === "offline") throw new Error("offline"); } }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const post = (emailId, valid = true, old = false) => {
    const body = JSON.stringify({ type: "email.bounced", data: { email_id: emailId, to: ["private@example.test"] } });
    const id = "msg_" + randomUUID(), timestamp = String(Math.floor(Date.now() / 1000) - (old ? 3600 : 0));
    const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "svix-id": id,
      "svix-timestamp": timestamp, "svix-signature": "v1," + (valid ? signature : "invalid") }, body });
  };
  assert.equal((await post("email_valid", false)).status, 400);
  assert.equal((await post("email_valid", true, true)).status, 400);
  assert.equal(received.length, 0);
  assert.equal((await post("email_valid")).status, 200);
  assert.equal((await post("offline")).status, 503);
  assert.equal(received.length, 2, "unconfirmed storage must not cause a hidden replay");
  assert.equal(Object.hasOwn(received[0], "to"), false);
});
