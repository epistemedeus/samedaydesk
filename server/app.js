// SameDayDesk — single Express process.
// Serves /api/* and (in production) the built Vite SPA from client/dist.
// Load-bearing order: RAW body for webhooks BEFORE express.json(); exact SPA route
// shells before static; history fallback last.
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
import { mcpHeaders, mcpJsonParser, mcpBodyError } from "./lib/mcp-http.js";
import agentReadinessRouter from "./routes/agent-readiness.js";
import { apexAgentCard } from "./lib/apex-agent-card.js";
import { mountApexDeclarations } from "./lib/apex-declarations.js";
import marketObservationsRouter from "./routes/market-observations.js";
import observatoryRouter from "./routes/observatory.js";
import { pulseMiddleware } from "./lib/pulse.js";
import { mountProductionClient } from "./lib/spa-client.js";
import { register } from "node:module";
import { mountCorrespondence } from "./lib/correspondence-mount.js";
import { installVerifiedPgTls } from "./foundry/pg-tls.js";
import { mountPublicReadiness } from "./lib/public-readiness-mount.js";
import { mountHostedUsefulJourney } from "../tools/hosted-useful-journey-100346/lib/router.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";
const CLIENT_DIST = process.env.SAMEDAYDESK_CLIENT_DIST
  ? path.resolve(process.env.SAMEDAYDESK_CLIENT_DIST)
  : path.resolve(__dirname, "../client/dist");

const EMBED_HOOKS = Symbol.for("sds.foundry.wasmtime49-embed-hooks");

export function createSdsApp(options = {}) {
installVerifiedPgTls();
if (process.env.FOUNDRY_EXECUTION_RUNTIME === "wasmtime49-embed" && !globalThis[EMBED_HOOKS]) {
  register(new URL("./foundry/wasmtime49-embed/hooks.mjs", import.meta.url));
  globalThis[EMBED_HOOKS] = true;
}
const app = express();
app.disable("x-powered-by");

// Include bearer-return redirects in the same cache/referrer protection as the
// endpoint. This does not change the canonical host or redirect destination.
app.use("/mcp", mcpHeaders);

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

// 1b) Optional correspondence mount. Own JSON/CORS/trust-proxy; must not
//     inherit the 1mb SDS parser or host-global CORS. Unconfigured = no-op
//     besides a truthful disabled healthz under the prefix.
const correspondence = mountCorrespondence(app, options.correspondence || {});
app.set("s51Correspondence", correspondence);

// Bounded raw intake before the global parser. Admission needs enrolled PG;
// anonymous snapshot evaluation and current publication facts remain separate.
app.set("s346HostedUsefulJourney", mountHostedUsefulJourney(app, options.hostedUsefulJourney || {}));

// 2) MCP owns its machine parser errors; unrelated APIs and raw webhooks retain
// their existing parsers and error behavior.
app.use("/mcp", mcpJsonParser, mcpBodyError);
// Everything else parses JSON normally. Already-read MCP/raw bodies are skipped.
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
app.use("/api/market-observations", marketObservationsRouter);
app.use("/api/observatory", observatoryRouter);
// Optional public-readiness adapter. Vendored MIT checker, no private Git.
// A disabled checker answers healthz and leaves every other route up.
mountPublicReadiness(app, options.publicReadiness || {});

// Unknown /api route → JSON 404 (never fall through to the SPA shell).
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// Server-rendered shareable proof page (must be before the SPA fallback).
app.use("/scan", scanRouter);

// Remote (Streamable HTTP) MCP server at /mcp (before the SPA fallback).
app.use("/mcp", mcpRouter);

// Free agent-readiness page. HTML for people, JSON with ?format=json.
app.use("/agent-readiness", agentReadinessRouter);

// Domain-ownership proof for the MCP registry (lets us list the remote MCP
// server under the com.samedaydesk namespace).
app.get("/.well-known/mcp-registry-auth", (_req, res) =>
  res.type("text/plain").send("v=MCPv1; k=ed25519; p=j1v9MjBVY0nqrVTwoNqXomOhEAisPObP5Fnq+J7Zc88="),
);

// Apex skills are generated from the MCP tool inventory. The paid gateway card
// stays on agents.samedaydesk.com and is named in the description, not copied.
app.get("/.well-known/agent-card.json", (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.type("application/json").send(apexAgentCard());
});

// Machine declarations derived from the mounted tools. Mounted before the SPA
// so a missing static file cannot turn them into an HTML document.
mountApexDeclarations(app);

// 4) Exact SPA route shells, then static files, then history fallback.
//    Route shells run first so /x402 is not a directory redirect to /x402/.
if (isProd) {
  mountProductionClient(app, CLIENT_DIST);
}

return app;
}
