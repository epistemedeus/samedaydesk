export const MASKED_VALUE = "********";

const KEY_RE = /^[A-Z0-9_]{1,255}$/;

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function planHostingerEnvPut({ liveKeys, backupKeys = null, desired } = {}) {
  if (!Array.isArray(liveKeys) || liveKeys.length === 0) throw coded("live_keys_required");
  const live = liveKeys.map((key) => String(key));
  if (new Set(live).size !== live.length) throw coded("duplicate_live_key");
  if (backupKeys != null) {
    if (!Array.isArray(backupKeys)) throw coded("backup_invalid");
    if (backupKeys.length < live.length) throw coded("stale_backup");
  }
  if (!desired || typeof desired !== "object" || Array.isArray(desired)) throw coded("desired_required");
  for (const key of live) {
    if (!Object.hasOwn(desired, key)) {
      const error = coded("live_key_omitted");
      error.key = key;
      throw error;
    }
  }
  const variables = [];
  for (const [key, value] of Object.entries(desired)) {
    if (!KEY_RE.test(key)) throw coded("env_key_invalid");
    if (typeof value !== "string" || value.length === 0 || value === MASKED_VALUE) {
      const error = coded("masked_or_empty_value");
      error.key = key;
      throw error;
    }
    variables.push({ key, value });
  }
  variables.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { method: "PUT", replaceAll: true, variables };
}
