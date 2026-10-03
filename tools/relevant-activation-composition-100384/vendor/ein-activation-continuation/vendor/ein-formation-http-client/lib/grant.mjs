import { openSync, fstatSync, readSync, closeSync, constants } from "node:fs";
import { resolve } from "node:path";

export const ENV_GRANT_TOKEN = "EIN_AGENT_GRANT";
export const ENV_GRANT_FILE = "EIN_AGENT_GRANT_FILE";
export const ENV_GRANT_ORIGIN = "EIN_AGENT_GRANT_ORIGIN";
const DEFAULT_GRANT_ORIGIN = "https://ein.llc";
const MAX_GRANT_FILE_BYTES = 8 * 1024;

/**
 * Load a scoped AgentGrant from env or a restricted local file.
 * Never invent grants; never accept them from CLI flags, URLs, or JSON bodies.
 */
export function loadGrantToken({ env = process.env, required = false, origin = DEFAULT_GRANT_ORIGIN } = {}) {
  const declaredOrigin =
    typeof env[ENV_GRANT_ORIGIN] === "string" && env[ENV_GRANT_ORIGIN].trim()
      ? env[ENV_GRANT_ORIGIN].trim()
      : DEFAULT_GRANT_ORIGIN;
  if (declaredOrigin !== origin) {
    const err = new Error(
      `${ENV_GRANT_ORIGIN} must exactly match the request origin before a grant can be read`,
    );
    err.code = "missing_grant";
    err.status = 401;
    throw err;
  }
  const fromEnv = typeof env[ENV_GRANT_TOKEN] === "string" ? env[ENV_GRANT_TOKEN].trim() : "";
  if (fromEnv) return validGrant(fromEnv);

  const filePath = typeof env[ENV_GRANT_FILE] === "string" ? env[ENV_GRANT_FILE].trim() : "";
  if (filePath) {
    const absolute = resolve(filePath);
    let fd;
    try {
      fd = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
      const stats = fstatSync(fd);
      if (
        !stats.isFile() ||
        stats.size > MAX_GRANT_FILE_BYTES ||
        (stats.mode & 0o077) !== 0 ||
        (typeof process.getuid === "function" && stats.uid !== process.getuid())
      ) {
        throw new Error("unsafe grant file");
      }
      const bytes = Buffer.alloc(MAX_GRANT_FILE_BYTES + 1);
      const size = readSync(fd, bytes, 0, bytes.length, 0);
      if (size > MAX_GRANT_FILE_BYTES) throw new Error("grant limit");
      return validGrant(bytes.subarray(0, size).toString("utf8").trim());
    } catch {
      const err = new Error(
        `${ENV_GRANT_FILE} must be a readable, owner-only regular file containing a valid grant`,
      );
      err.code = "missing_grant";
      throw err;
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }

  if (required) {
    const err = new Error(
      `Set ${ENV_GRANT_TOKEN} or ${ENV_GRANT_FILE}. Grants are never accepted as CLI flags, URLs, or JSON fields.`,
    );
    err.code = "missing_grant";
    err.status = 401;
    throw err;
  }
  return null;
}

function validGrant(token) {
  if (!token || token.length > MAX_GRANT_FILE_BYTES || /[\s\u0000-\u001f\u007f]/.test(token)) {
    const err = new Error("Invalid scoped grant credential");
    err.code = "missing_grant";
    throw err;
  }
  return token;
}
