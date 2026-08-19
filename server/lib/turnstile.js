// Cloudflare Turnstile, verified server side. When the keys are absent the check is a
// no-op, because this deployment is not running the panel anyway.
export async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };
  if (!token) return { ok: false, reason: "no_token" };
  try {
    const body = new URLSearchParams({ secret, response: String(token) });
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const data = await res.json();
    return { ok: Boolean(data.success), reason: (data["error-codes"] || []).join(",") };
  } catch (e) {
    console.error("[turnstile] verify failed", e?.message);
    return { ok: false, reason: "verify_failed" };
  }
}
