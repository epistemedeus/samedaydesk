// Static page delivery for the hand-authored documents (homepage, pay cards, terms,
// methods, for-agents). They are plain files with no build step. The only substitution is
// the CTA token, which switches on the panel config so the page never promises quotes the
// deployment cannot produce.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ctaButton } from "./panel.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, "../../client/dist");
const PUBLIC = path.resolve(here, "../../client/public");

const cache = new Map();

// Built output wins, so production serves exactly what the build produced. The public
// source is the fallback so the same routes work in development.
export function resolvePage(rel) {
  const built = path.join(DIST, rel);
  if (fs.existsSync(built)) return built;
  const src = path.join(PUBLIC, rel);
  return fs.existsSync(src) ? src : null;
}

export function renderPage(rel) {
  const file = resolvePage(rel);
  if (!file) return null;
  const stamp = fs.statSync(file).mtimeMs;
  const key = `${file}:${stamp}`;
  const hit = cache.get(rel);
  if (hit && hit.key === key) return hit.html;
  const html = fs.readFileSync(file, "utf8").replaceAll("<!--CTA_BUTTON-->", ctaButton());
  cache.set(rel, { key, html });
  return html;
}

export function sendPage(rel) {
  return (_req, res, next) => {
    const html = renderPage(rel);
    if (html == null) return next();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(html);
  };
}
