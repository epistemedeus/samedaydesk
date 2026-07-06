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
import scanRouter from "./routes/scan.js";
import checkoutRouter from "./routes/checkout.js";
import uploadsRouter from "./routes/uploads.js";
import stripeWebhookRouter from "./routes/stripe-webhook.js";
import resendWebhookRouter from "./routes/resend-webhook.js";
import pulseRouter from "./routes/pulse.js";
import mcpRouter from "./routes/mcp.js";
import { pulseMiddleware } from "./lib/pulse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";
const CLIENT_DIST = path.resolve(__dirname, "../client/dist");

const app = express();
app.disable("x-powered-by");

// 0) Canonical host: 301 any `www.` request to the bare apex, preserving path + query.
//    Runs first so a www hit short-circuits before anything else. GET/HEAD only, so
//    API/webhook POSTs are never redirected (a 301 on POST can drop the body). The
//    apex is already what <link rel="canonical"> and the sitemap point at; this makes
//    www a redirect instead of a 200 duplicate.
app.use((req, res, next) => {
  const host = req.headers.host || "";
  if ((req.method === "GET" || req.method === "HEAD") && host.startsWith("www.")) {
    return res.redirect(301, `https://${host.slice(4)}${req.originalUrl}`);
  }
  next();
});

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

// 2b) In-memory, no-PII traffic analytics (records page/content GETs). Must run
//     before the routers so it sees every request, including /scan and the SPA.
app.use(pulseMiddleware);

// 3) API routes.
app.use("/api", healthRouter);
app.use("/api/pulse", pulseRouter);
app.use("/api/auth", authRouter);
app.use("/api/teaser", teaserRouter);
app.use("/api/tools", toolsRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/stripe", stripeWebhookRouter);
app.use("/api/webhooks/resend", resendWebhookRouter);

// Unknown /api route → JSON 404 (never fall through to the SPA shell).
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// Server-rendered shareable proof page (must be before the SPA fallback).
app.use("/scan", scanRouter);

// Remote (Streamable HTTP) MCP server at /mcp (before the SPA fallback).
app.use("/mcp", mcpRouter);

// Domain-ownership proof for the MCP registry (lets us list the remote MCP
// server under the com.samedaydesk namespace).
app.get("/.well-known/mcp-registry-auth", (_req, res) =>
  res.type("text/plain").send("v=MCPv1; k=ed25519; p=j1v9MjBVY0nqrVTwoNqXomOhEAisPObP5Fnq+J7Zc88="),
);

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
  // Clean URL for the SkillGuard landing page (the CLI/README funnel target).
  app.get("/skillguard", (_req, res) => res.sendFile(path.join(CLIENT_DIST, "skillguard.html")));
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[samedaydesk] listening on :${PORT}  (${isProd ? "production" : "development"})`);
});
