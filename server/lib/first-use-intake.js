import { createHash } from "node:crypto";
import { isIP } from "node:net";

export function publicFirstUseUrl(value, { query = false } = {}) {
  if (typeof value !== "string" || value.length > 1024 || /[\s\u0000-\u001f\u007f]/u.test(value)) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || (!query && url.search) ||
        isIP(host) || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(host) ||
        /\.(?:local|localhost|internal|test|invalid|example|onion)$/i.test(host)) return null;
    return url.href;
  } catch { return null; }
}

export function firstUseIntake(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      !Object.keys(input).every(key => ["targetUrl", "details", "uploadPath"].includes(key))) return null;
  const targetUrl = publicFirstUseUrl(input.targetUrl);
  const details = typeof input.details === "string" ? input.details.trim() : "";
  if (!targetUrl || !details || Buffer.byteLength(details) > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(details) ||
      (input.uploadPath !== undefined && input.uploadPath !== "")) return null;
  return { targetUrl, details, uploadPath: "" };
}

export const intakeDigest = snapshot => createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

export function storedFirstUseIntake(attempt) {
  const snapshot = firstUseIntake(attempt?.intake_snapshot);
  return snapshot && intakeDigest(snapshot) === attempt.intake_hash ? snapshot : null;
}

export function firstUseIntentMatches(intent, attempt, live) {
  return intent && attempt && intent.amount === attempt.amount && intent.currency === attempt.currency &&
    intent.livemode === live && intent.metadata?.uid === attempt.user_id &&
    intent.metadata?.offer === attempt.offer && intent.metadata?.payment_attempt_id === attempt.id;
}
