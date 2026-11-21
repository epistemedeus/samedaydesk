import path from "node:path";
import express from "express";
import compression from "compression";
import { createSpaFallback } from "./spa-fallback.js";
import { START_GUIDE_LINK } from "./start-guide.js";
import { createRouteShellMiddleware } from "./spa-route-shells.js";
import { mountReceiptSnapshot } from "./receipt-snapshot.js";

export function mountProductionClient(app, clientDist) {
  mountReceiptSnapshot(app, clientDist);
  // Keep the already published finding and resolved-report URLs usable on reload.
  app.use((req, res, next) => {
    if ((req.method === "GET" || req.method === "HEAD") && req.path === "/x402/seller-conformance/") {
      const search = new URL(req.originalUrl, "http://private").search;
      return res.redirect(301, "/x402/seller-conformance" + search);
    }
    next();
  });
  // This mount runs after the API. Compress built public documents and browser
  // code without changing a signed receipt, range response or identity client.
  app.use(compression({
    threshold: 1024,
    filter(req, res) {
      return !req.headers.range && /^(?:text\/(?:html|css|javascript)|application\/javascript)\b/i
        .test(String(res.getHeader("Content-Type") || "")) && compression.filter(req, res);
    },
  }));
  app.use(createRouteShellMiddleware(clientDist));
  app.use(
    express.static(clientDist, {
      setHeaders(res, file) {
        if (path.resolve(file) === path.resolve(clientDist, "index.html")) res.setHeader("Link", START_GUIDE_LINK);
        if (file.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
        else if (/\.[0-9a-f]{8,}\./.test(file)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        else res.setHeader("Cache-Control", "public, max-age=3600");
      },
    }),
  );
  app.get("/skillguard", (_req, res) => res.sendFile(path.join(clientDist, "skillguard.html")));
  app.use(createSpaFallback(clientDist));
  return app;
}
