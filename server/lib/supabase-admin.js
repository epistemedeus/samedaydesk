// Supabase service-role client (bypasses RLS — server-trusted writes) +
// local JWT verification via the project JWKS (asymmetric keys, default since Oct 2025),
// with an HS256 fallback for legacy projects. Lazy: nothing throws at import time.
import { createClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify } from "jose";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET; // optional legacy HS256 fallback

export const isSupabaseConfigured = () => Boolean(url && serviceKey);

let _admin = null;
export function supabaseAdmin() {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  if (!_admin) {
    _admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

let _jwks = null;
function jwks() {
  if (!url) throw new Error("SUPABASE_URL not set");
  if (!_jwks) _jwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
  return _jwks;
}

// Verify a Supabase access token. Prefer JWKS (asymmetric); fall back to HS256 secret if present.
export async function verifySupabaseJwt(token) {
  try {
    const { payload } = await jwtVerify(token, jwks());
    return payload;
  } catch (err) {
    if (jwtSecret) {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret));
      return payload;
    }
    throw err;
  }
}
