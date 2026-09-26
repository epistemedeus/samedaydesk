import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  ERROR_CODE,
  GRANT_ATTEMPT_FILE,
  SCHEMA,
  TOKEN_FILE_NAME,
} from "./constants.mjs";
import { fail } from "./errors.mjs";
import { assertSecretFree } from "./redact.mjs";

export function ensureEmptyDir(outDir) {
  const absolute = resolve(outDir);
  if (existsSync(absolute)) {
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink() || !stat.isDirectory() || readdirSync(absolute).length) {
      fail(
        ERROR_CODE.GRANT_OUT_DIR_NOT_EMPTY,
        "grant --out-dir must be an empty real directory; reconcile any earlier attempt before issuing again",
      );
    }
  } else {
    mkdirSync(absolute, { recursive: true, mode: 0o700 });
  }
  return absolute;
}

export function ensureDir(dir) {
  const absolute = resolve(dir);
  mkdirSync(absolute, { recursive: true, mode: 0o700 });
  return absolute;
}

export function writeGrantAttempt(outDir, payload) {
  const path = resolve(outDir, GRANT_ATTEMPT_FILE);
  const body = {
    schema: SCHEMA.grantAttempt,
    command: payload.command,
    role: "owner",
    backend: payload.backend,
    contributorPublicId: payload.contributorPublicId ?? null,
    taskId: payload.taskId ?? null,
    status: payload.status || "attempted; do not automatically retry",
    httpStatus: payload.httpStatus ?? null,
    autoRetry: false,
    idempotencyKeySent: false,
  };
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return path;
}

export function readGrantAttempt(outDir) {
  const path = resolve(outDir, GRANT_ATTEMPT_FILE);
  if (!existsSync(path)) {
    fail(ERROR_CODE.INVALID_INPUT, `grant-attempt.json not found in ${absoluteGrantDirHint(outDir)}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

export function updateGrantAttempt(outDir, patch) {
  const path = resolve(outDir, GRANT_ATTEMPT_FILE);
  const current = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { schema: SCHEMA.grantAttempt };
  const next = { ...current, ...patch, autoRetry: false, idempotencyKeySent: false };
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return path;
}

export function resolveGrantDir(outDir) {
  if (!outDir) fail(ERROR_CODE.INVALID_INPUT, "--out-dir is required");
  const absolute = resolve(outDir);
  if (existsSync(join(absolute, GRANT_ATTEMPT_FILE)) || existsSync(join(absolute, TOKEN_FILE_NAME))) {
    return absolute;
  }
  const nested = join(absolute, "grant");
  if (existsSync(join(nested, GRANT_ATTEMPT_FILE)) || existsSync(join(nested, TOKEN_FILE_NAME))) {
    return nested;
  }
  fail(
    ERROR_CODE.INVALID_INPUT,
    "reconcile needs a grant attempt directory (grant-attempt.json or contributor.token)",
  );
}

function absoluteGrantDirHint(outDir) {
  return resolve(outDir);
}

export function writeSecretFile(path, plaintext) {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 });
  writeFileSync(absolute, `${plaintext}\n`, { flag: "wx", mode: 0o600 });
  return absolute;
}

export function readTokenFileOnce(tokenFile) {
  if (!tokenFile) fail(ERROR_CODE.MISSING_TOKEN_FILE, "--token-file is required");
  const absolute = resolve(tokenFile);
  if (!existsSync(absolute)) fail(ERROR_CODE.MISSING_TOKEN_FILE, `token file not found: ${absolute}`);
  const raw = readFileSync(absolute, "utf8").trim();
  if (!raw) fail(ERROR_CODE.MISSING_TOKEN_FILE, "token file is empty");
  if (raw.startsWith("{")) {
    const parsed = JSON.parse(raw);
    if (typeof parsed.token === "string" && parsed.token.trim()) return parsed.token.trim();
    fail(ERROR_CODE.INVALID_INPUT, "token JSON must contain a token field");
  }
  return raw;
}

export function writeJsonSecretFree(path, record, secrets, mode = 0o600, flag = "w") {
  assertSecretFree(record, secrets, path);
  writeFileSync(resolve(path), `${JSON.stringify(record, null, 2)}\n`, { mode, flag });
  return resolve(path);
}

export function defaultTokenPath(outDir) {
  return resolve(outDir, TOKEN_FILE_NAME);
}

export function readOwnerToken({ ownerTokenFile, env = process.env } = {}) {
  if (ownerTokenFile) {
    const absolute = resolve(ownerTokenFile);
    if (!existsSync(absolute)) fail(ERROR_CODE.MISSING_OWNER_TOKEN, `owner token file not found: ${absolute}`);
    const token = readFileSync(absolute, "utf8").trim();
    if (!token || token.length < 8) fail(ERROR_CODE.MISSING_OWNER_TOKEN, "owner token file must contain >= 8 characters");
    return token;
  }
  const fromEnv = env.EARNED_WORK_OWNER_TOKEN;
  if (!fromEnv || fromEnv.length < 8) {
    fail(ERROR_CODE.MISSING_OWNER_TOKEN, "owner role requires --owner-token-file or EARNED_WORK_OWNER_TOKEN");
  }
  return fromEnv;
}
