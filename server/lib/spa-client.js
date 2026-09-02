import path from "node:path";
import express from "express";
import { createSpaFallback } from "./spa-fallback.js";
import { createRouteShellMiddleware } from "./spa-route-shells.js";

export function mountProductionClient(app, clientDist) {
  app.get("/.well-known/agent-card.json", (_req, res) => {
    res.redirect(308, "https://agents.samedaydesk.com/.well-known/agent-card.json");
  });
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
