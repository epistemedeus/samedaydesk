import { readFileSync, statSync } from "node:fs";

function modeBits(file) {
  const stat = statSync(file);
  if (!stat.isFile()) {
    const error = new Error("private foundry input must be a regular file");
    error.code = "private_input_not_file";
    throw error;
  }
  if ((stat.mode & 0o077) !== 0) {
    const error = new Error("private foundry input must be mode 0600");
    error.code = "private_input_mode";
    throw error;
  }
  return stat;
}

export function readPrivateJson(file) {
  modeBits(file);
  const text = readFileSync(file, "utf8");
  if (text.length > 65536) {
    const error = new Error("private foundry profile exceeds 65536 bytes");
    error.code = "private_input_size";
    throw error;
  }
  return JSON.parse(text);
}

export function readParticipationKey(file) {
  modeBits(file);
  const text = readFileSync(file, "utf8");
  const key = text.endsWith("\n") ? text.slice(0, -1) : text;
  if (key.length < 32 || key.length > 256 || /[\r\n]/.test(key)) {
    const error = new Error("participation key file must be one 32 to 256 character line");
    error.code = "participation_key_invalid";
    throw error;
  }
  return key;
}

export function hostInputsFromEnv(env = process.env) {
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
