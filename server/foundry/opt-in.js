export const DEFAULT_BODY_LIMIT_BYTES = 32 * 1024;
export const FOUNDRY_OPT_IN_BODY_LIMIT_BYTES = 524288;

export function foundryHostOptIn(env = process.env) {
  const raw = env.FOUNDRY_HOST_OPT_IN;
  if (raw == null || String(raw).trim() === "" || String(raw).trim() === "0") return false;
  if (String(raw).trim() === "1") return true;
  throw new Error("FOUNDRY_HOST_OPT_IN must be unset, 0, or 1");
}

export function parseFoundryBodyLimit(env = process.env) {
  const optedIn = foundryHostOptIn(env);
  const raw = env.CORRESPONDENCE_BODY_LIMIT_BYTES;
  const specified = raw != null && String(raw).trim() !== "";
  const value = specified ? Number(String(raw).trim()) : null;
  if (specified && !Number.isInteger(value)) {
    throw new Error("CORRESPONDENCE_BODY_LIMIT_BYTES must be an integer byte count");
  }
  if (!optedIn) {
    if (specified && value !== DEFAULT_BODY_LIMIT_BYTES) {
      throw new Error("CORRESPONDENCE_BODY_LIMIT_BYTES stays 32768 unless FOUNDRY_HOST_OPT_IN=1");
    }
    return DEFAULT_BODY_LIMIT_BYTES;
  }
  if (specified && value !== FOUNDRY_OPT_IN_BODY_LIMIT_BYTES) {
    throw new Error("opt-in foundry body limit must be exactly 524288");
  }
  return FOUNDRY_OPT_IN_BODY_LIMIT_BYTES;
}
