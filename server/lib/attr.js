// First-touch attribution, one cookie, no personal data in it.
//
// Records where a visitor first arrived from and which page they landed on, so a purchase
// weeks later can be counted honestly. It holds a referrer host, a path, and a UTC date.
// It does not hold an identifier for a person.
import { refererHost, aiReferrer } from "./classify.js";

export const COOKIE = "sdd_attr";
const MAX_AGE_DAYS = 90;

export function buildValue({ referer, path, now = new Date() }) {
  const host = refererHost(referer);
  const source = aiReferrer(host) || host || "direct";
  return `${source}|${String(path || "/").slice(0, 60)}|${now.toISOString().slice(0, 10)}`;
}

export function parseValue(raw) {
  const [source, path, date] = String(raw || "").split("|");
  return source ? { source, path: path || null, date: date || null } : null;
}

export function attrMiddleware(req, res, next) {
  try {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    const cookies = String(req.headers.cookie || "");
    if (cookies.includes(`${COOKIE}=`)) {
      req.attr = parseValue(decodeURIComponent(cookies.split(`${COOKIE}=`)[1].split(";")[0]));
      return next();
    }
    const value = buildValue({ referer: req.headers.referer, path: req.path });
    req.attr = parseValue(value);
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${MAX_AGE_DAYS * 24 * 60 * 60}; SameSite=Lax; HttpOnly`,
    );
  } catch {
    // Attribution must never break a page.
  }
  return next();
}
