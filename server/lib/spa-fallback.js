import path from "node:path";

// History-API routes are extensionless. File-like paths and well-known URIs are
// machine resources: if static/explicit handlers did not serve them, they must
// 404 rather than reuse the SPA homepage (Google Search Central, "Use meaningful
// HTTP status codes" / avoid soft 404s; RFC 8615 well-known URIs).

export function isSpaFallbackPath(pathname) {
  if (typeof pathname !== "string" || pathname.length === 0) return false;
  const pathOnly = pathname.split("?")[0].split("#")[0];
  if (pathOnly === "/.well-known" || pathOnly.startsWith("/.well-known/")) return false;
  const segments = pathOnly.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || "";
  if (last.includes(".")) return false;
  return true;
}

export function createSpaFallback(clientDist) {
  const indexHtml = path.join(clientDist, "index.html");
  return function spaFallback(req, res, next) {
    if (req.method !== "GET") return next();
    if (!isSpaFallbackPath(req.path)) {
      res.status(404);
      res.setHeader("Cache-Control", "no-store");
      res.type("text/plain").send("Not found\n");
      return;
    }
    res.sendFile(indexHtml, (err) => (err ? next(err) : undefined));
  };
}
