import { existsSync } from "node:fs";
import path from "node:path";
import { NOT_FOUND_SHELL, shellFilePath } from "./spa-route-shells.js";

// Declared React history routes from client/src/App.tsx. Route authority is
// this explicit list, not "any extensionless string". Unknown HTML paths still
// receive the SPA index body so React can render Not Found, but they must be
// HTTP 404 (Google Search Central: avoid crawler soft-404s). File-like and
// well-known resources stay plain 404s.

export const SPA_HISTORY_ROUTES = Object.freeze([
  "/",
  "/tools/ai-readiness",
  "/x402",
  "/x402/seller-conformance",
  "/for-agents",
  "/login",
  "/signup",
  "/dashboard",
  "/checkout",
  "/terms",
  "/privacy",
]);

const SPA_HISTORY_ROUTE_SET = new Set(SPA_HISTORY_ROUTES);

function requestPathname(pathname) {
  if (typeof pathname !== "string" || pathname.length === 0) return "";
  return pathname.split("?")[0].split("#")[0];
}

export function isMachineResourcePath(pathname) {
  const pathOnly = requestPathname(pathname);
  if (!pathOnly) return true;
  if (pathOnly === "/.well-known" || pathOnly.startsWith("/.well-known/")) return true;
  const segments = pathOnly.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || "";
  return last.includes(".");
}

export function isSpaHistoryPath(pathname) {
  return SPA_HISTORY_ROUTE_SET.has(requestPathname(pathname));
}

export function createSpaFallback(clientDist) {
  const indexHtml = path.join(clientDist, "index.html");
  const notFoundHtml = shellFilePath(clientDist, NOT_FOUND_SHELL.path);
  return function spaFallback(req, res, next) {
    if (req.method !== "GET") return next();
    if (isMachineResourcePath(req.path)) {
      res.status(404);
      res.setHeader("Cache-Control", "no-store");
      res.type("text/plain").send("Not found\n");
      return;
    }
    if (!isSpaHistoryPath(req.path)) {
      res.status(404);
      res.setHeader("Cache-Control", "no-cache");
      if (existsSync(notFoundHtml)) {
        res.sendFile(notFoundHtml, (err) => (err ? next(err) : undefined));
        return;
      }
    }
    res.sendFile(indexHtml, (err) => (err ? next(err) : undefined));
  };
}
