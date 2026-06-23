// SameDayDesk — single Express process.
// Serves /api/* and (in production) the built Vite SPA from client/dist.
// Load-bearing order: RAW body for webhooks BEFORE express.json(); SPA fallback last.
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import teaserRouter from "./routes/teaser.js";
import toolsRouter from "./routes/tools.js";
import checkoutRouter from "./routes/checkout.js";
import uploadsRouter from "./routes/uploads.js";
import stripeWebhookRouter from "./routes/stripe-webhook.js";
import resendWebhookRouter from "./routes/resend-webhook.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";
const CLIENT_DIST = path.resolve(__dirname, "../client/dist");

const app = express();
app.disable("x-powered-by");

// 1) Webhooks need the RAW, unparsed body for signature verification. Mount these
//    BEFORE express.json(), and stash the raw bytes for the handler.
function captureRaw(req, _res, next) {
  req.rawBody = req.body; // Buffer (express.raw)
  next();
}
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }), captureRaw);
app.use("/api/webhooks/resend", express.raw({ type: "application/json" }), captureRaw);

// 2) Everything else parses JSON normally.
app.use(express.json({ limit: "1mb" }));

// 3) API routes.
app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/teaser", teaserRouter);
app.use("/api/tools", toolsRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/stripe", stripeWebhookRouter);
app.use("/api/webhooks/resend", resendWebhookRouter);

// Unknown /api route → JSON 404 (never fall through to the SPA shell).
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// 4) Static SPA + history fallback (production only; in dev Vite serves the client).
if (isProd) {
  app.use(
    express.static(CLIENT_DIST, {
      setHeaders(res, file) {
        if (file.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
        else if (/\.[0-9a-f]{8,}\./.test(file)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        else res.setHeader("Cache-Control", "public, max-age=3600");
      },
    }),
  );
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[samedaydesk] listening on :${PORT}  (${isProd ? "production" : "development"})`);
});
