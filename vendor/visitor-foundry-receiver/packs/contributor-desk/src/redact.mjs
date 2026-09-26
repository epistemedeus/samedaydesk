const SECRETISH =
  /\b(EARNED_WORK_(?:[A-Z0-9_]*_)?(?:OWNER_TOKEN|SECRET|PRIVATE_KEY|PAYOUT_KEY|ADMIN_TOKEN|TOKEN))\b/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const HEX64 = /\b[0-9a-fA-F]{64}\b/g;

const SECRET_KEY_NAME =
  /^EARNED_WORK_(?:[A-Z0-9_]*_)?(?:OWNER_TOKEN|SECRET|PRIVATE_KEY|PAYOUT_KEY|ADMIN_TOKEN|TOKEN)$/;

export function redactString(value) {
  if (typeof value !== "string") return value;
  // Hits name the env key. Do not rewrite the identifier into an assignment.
  if (SECRET_KEY_NAME.test(value)) return value;
  return value
    .replace(SECRETISH, "$1=<redacted>")
    .replace(BEARER, "Bearer <redacted>")
    .replace(HEX64, "<redacted-hex>");
}

export function redactDeep(value, { keepTermsHash = true } = {}) {
  if (typeof value === "string") {
    if (keepTermsHash && /^sha256:[0-9a-f]{64}$/.test(value)) return value;
    return redactString(value);
  }
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, { keepTermsHash }));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (/token|secret|private|payoutKey|seed|mnemonic/i.test(key) && typeof item === "string") {
        out[key] = "<redacted>";
        continue;
      }
      out[key] = redactDeep(item, { keepTermsHash });
    }
    return out;
  }
  return value;
}
