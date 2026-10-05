import { fileURLToPath } from "node:url";
import { readPrivateBytes } from "./private-paths.js";
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export function readPrivateJson(file) {
  const text = readPrivateBytes(file, { repoRoot }).toString("utf8");
  return JSON.parse(text);
}

export function readParticipationKey(file) {
  const text = readPrivateBytes(file, { repoRoot }).toString("utf8");
  const key = text.endsWith("\n") ? text.slice(0, -1) : text;
  if (key.length < 32 || key.length > 256 || /[\r\n]/.test(key)) {
    const error = new Error("participation key file must be one 32 to 256 character line");
    error.code = "participation_key_invalid";
    throw error;
  }
  return key;
}

const LISTENER_JSON_KEYS = [
  "FOUNDRY_HOST_PROFILE_JSON",
  "FOUNDRY_PRIVATE_PROFILE_JSON",
  "FOUNDRY_PARTICIPATION_KEY",
  "FOUNDRY_PGSSL_CA_PEM",
];

export function hostInputsFromEnv(env = process.env) {
  if (LISTENER_JSON_KEYS.some((key) => String(env[key] || "").trim())) {
    return { ok: false, reason: "profile_json_in_listener" };
  }
  const hostProfileFile = String(env.FOUNDRY_HOST_PROFILE_FILE || "").trim();
  const participationKeyFile = String(env.FOUNDRY_PARTICIPATION_KEY_FILE || "").trim();
  if (!hostProfileFile || !participationKeyFile) {
    return { ok: false, reason: "private_profile_unset" };
  }
  try {
    return {
      ok: true,
      hostProfile: readPrivateJson(hostProfileFile),
      participationKey: readParticipationKey(participationKeyFile),
    };
  } catch (error) {
    return { ok: false, reason: error.code || "private_profile_unreadable" };
  }
}
