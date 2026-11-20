import path from "node:path";
import express from "express";
import compression from "compression";
import { createSpaFallback } from "./spa-fallback.js";
import { createRouteShellMiddleware } from "./spa-route-shells.js";
import { mountReceiptSnapshot } from "./receipt-snapshot.js";

export function mountProductionClient(app, clientDist) {
  mountReceiptSnapshot(app, clientDist);
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
