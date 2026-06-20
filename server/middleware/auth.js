// The three server-side gates. Trust nothing from the client for money or status.
import { verifySupabaseJwt, isSupabaseConfigured } from "../lib/supabase-admin.js";

// requireAuth — a valid Supabase access token (Bearer). Derives identity from the token only.
export async function requireAuth(req, res, next) {
  if (!isSupabaseConfigured()) return res.status(503).json({ error: "Auth not configured" });
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });
  try {
    const c = await verifySupabaseJwt(h.slice(7));
    req.uid = c.sub;
    req.userEmail = c.email;
    // Supabase puts email_verified at the top level and/or in user_metadata depending on flow.
    req.emailVerified = c.email_verified === true || c.user_metadata?.email_verified === true;
    req.claims = c;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// requireVerifiedEmail — the email gate (enforced server-side, not just in the UI). Off until P7.
export function requireVerifiedEmail(req, res, next) {
  if (!req.uid) return res.status(401).json({ error: "Not authenticated" });
  if (req.emailVerified) return next();
  res.status(403).json({ error: "Email not verified", code: "email_not_verified" });
}

// requireAdmin — env-pinned uid/email (never a client-writable role flag).
export function requireAdmin(req, res, next) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminUid = process.env.ADMIN_UID;
  if (req.uid && ((adminUid && req.uid === adminUid) || (adminEmail && req.userEmail === adminEmail))) return next();
  res.status(403).json({ error: "Admin access required" });
}
