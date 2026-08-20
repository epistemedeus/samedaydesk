// SameDayDesk single Express process.
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
import { persistPulse, pulseMiddleware } from "./lib/pulse.js";
import { sendPage } from "./lib/pages.js";
import intakeRouter from "./routes/intake.js";
import reportRouter from "./routes/report.js";
import metricsRouter from "./routes/metrics.js";
import { attrMiddleware } from "./lib/attr.js";
import { startAbandonedSweep } from "./lib/abandoned.js";

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

// 0b) Retired/consolidated URLs → 301 to their canonical replacement. Runs before
//     express.static so the old file (if still present) never serves a 200. Add a
//     row here whenever a near-duplicate page is folded into another.
const RETIRED_301 = new Map([
  // Near-duplicate of the AI-citation checklist; folded into the well-linked hub page.
  ["/guides/how-to-get-cited-by-ai-search-2026.html", "/guides/get-cited-by-ai-search.html"],
  // The standalone sales page for the retired audit ladder. Same intent as the homepage
  // offer table, so it redirects rather than 410s.
  ["/ai-visibility-audit.html", "/"],
]);
app.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") {
    const dest = RETIRED_301.get(req.path);
    if (dest) return res.redirect(301, dest);
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

// 2) Everything else parses JSON normally. Form posts arrive urlencoded, because every
//    money and intake form on this site works without JavaScript.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// 2b) In-memory, no-PII traffic analytics (records page/content GETs). Must run
//     before the routers so it sees every request, including /scan and the SPA.
app.use(pulseMiddleware);

// 2c) First-touch attribution cookie: referrer host, landing path, UTC date. No identifier.
app.use(attrMiddleware);

// 3) API routes.
app.use("/api", healthRouter);
app.use("/api/pulse", pulseRouter);
app.use("/api/metrics", metricsRouter);
app.use("/api/auth", authRouter);
app.use("/api/teaser", teaserRouter);
app.use("/api/tools", toolsRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api/intake", intakeRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/stripe", stripeWebhookRouter);
app.use("/api/webhooks/resend", resendWebhookRouter);

// Unknown /api route → JSON 404 (never fall through to the SPA shell).
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// Hand-authored static documents, served ahead of express.static so the app shell never
// answers for them. These carry the offer facts in first-byte HTML.
app.get("/", sendPage("home.html"));
app.get("/terms", sendPage("terms.html"));
app.get("/methods", sendPage("methods.html"));
app.get("/for-agents", sendPage("for-agents.html"));
app.get("/pay/audit", sendPage("pay/audit.html"));
app.get("/pay/sprint", sendPage("pay/sprint.html"));
app.get("/pay/sprint-plus", sendPage("pay/sprint-plus.html"));

// The free report: form on GET, streamed two-phase result on POST.
app.use("/report", reportRouter);

// Post-payment intake, keyed by the Stripe session id (server rendered, no JavaScript).
app.use("/intake", intakeRouter);

// Server-rendered shareable proof page (must be before the SPA fallback).
app.use("/scan", scanRouter);

// Remote (Streamable HTTP) MCP server at /mcp (before the SPA fallback).
app.use("/mcp", mcpRouter);

// Domain-ownership proof for the MCP registry (lets us list the remote MCP
// server under the com.samedaydesk namespace).
app.get("/.well-known/mcp-registry-auth", (_req, res) =>
  res.type("text/plain").send("v=MCPv1; k=ed25519; p=j1v9MjBVY0nqrVTwoNqXomOhEAisPObP5Fnq+J7Zc88="),
);

// A2A Global Registry ownership proof. Express deliberately ignores dotfiles
// in static directories by default, so expose this single reviewed manifest
// explicitly while keeping the rest of client/dist's hidden files private.
app.get("/.well-known/agent-card.json", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.sendFile(path.join(CLIENT_DIST, ".well-known", "agent-card.json"), { dotfiles: "allow" });
});

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

  // The SPA owns exactly these paths. Everything else that reached this point does not
  // exist, so it gets a real 404 instead of a 200 carrying the homepage document
  // (published self-audit, finding SDD-2026-006).
  const SPA_PATHS = new Set(["/tools/ai-readiness", "/x402", "/login", "/signup", "/dashboard", "/checkout", "/privacy"]);
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (SPA_PATHS.has(req.path)) return res.sendFile(path.join(CLIENT_DIST, "index.html"));
    res.status(404).sendFile(path.join(CLIENT_DIST, "404.html"));
  });
}

// Daily one-shot recovery for paid orders whose intake is still open.
startAbandonedSweep();

const PORT = process.env.PORT || 3000;
// Do not pass a callback to app.listen. Express 5 routes the listen `error`
// event into that callback (`server.once("error", done)`), so an `() => log`
// handler swallows EADDRINUSE, prints "listening", and the process exits 0.
const server = app.listen(PORT, "0.0.0.0");
server.on("error", (err) => {
  console.error(`[samedaydesk] listen failed on :${PORT}: ${err.code || err.message}`);
  process.exit(1);
});
server.on("listening", () => {
  console.log(`[samedaydesk] listening on :${PORT}  (${isProd ? "production" : "development"})`);
});

// Graceful preview/process stop. Pulse used to listen for SIGTERM without
// exiting, so TERM left the HTTP server on the port until SIGKILL.
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    persistPulse();
  } catch {
    /* never block stop on analytics */
  }
  const force = setTimeout(() => {
    try {
      server.closeAllConnections?.();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }, 4000);
  force.unref?.();
  try {
    server.closeIdleConnections?.();
  } catch {
    /* ignore */
  }
  server.close((err) => process.exit(err ? 1 : 0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
