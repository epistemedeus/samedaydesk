import { chmodSync, mkdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PROFILE_JSON_KEYS = Object.freeze([
  "FOUNDRY_HOST_PROFILE_JSON",
  "FOUNDRY_PRIVATE_PROFILE_JSON",
  "FOUNDRY_PARTICIPATION_KEY",
  "FOUNDRY_PGSSL_CA_PEM",
]);

const FILES = Object.freeze([
  ["FOUNDRY_HOST_PROFILE_JSON", "FOUNDRY_HOST_PROFILE_FILE", "host-profile.json", "json"],
  ["FOUNDRY_PARTICIPATION_KEY", "FOUNDRY_PARTICIPATION_KEY_FILE", "participation.key", "key"],
  ["FOUNDRY_PRIVATE_PROFILE_JSON", "FOUNDRY_PRIVATE_PROFILE_FILE", "private-profile.json", "json"],
  ["FOUNDRY_PGSSL_CA_PEM", "CORRESPONDENCE_PGSSL_CA_FILE", "prod-ca.pem", "pem"],
]);

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function resolveExisting(file) {
  const absolute = path.resolve(file);
  const parent = path.dirname(absolute);
  let base = parent;
  try {
    base = realpathSync(parent);
  } catch {
    base = path.resolve(parent);
  }
  return path.join(base, path.basename(absolute));
}

export function assertPrivateLocation(file, repoRoot) {
  const resolved = resolveExisting(file);
  if (resolved.split(path.sep).includes("public_html")) throw coded("private_path_refused");
  const root = path.resolve(repoRoot);
  if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) throw coded("private_path_refused");
  return resolved;
}

function parsePayload(kind, raw) {
  const text = String(raw ?? "");
  if (kind === "json") {
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw coded("private_profile_json_invalid");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw coded("private_profile_json_invalid");
    return `${JSON.stringify(value)}\n`;
  }
  if (kind === "key") {
    const key = text.endsWith("\n") ? text.slice(0, -1) : text;
    if (key.length < 32 || key.length > 256 || /[\r\n]/.test(key)) throw coded("participation_key_invalid");
    return `${key}\n`;
  }
  if (!text.includes("BEGIN CERTIFICATE") || text.length > 1024 * 1024) throw coded("pg_ca_unreadable");
  return text.endsWith("\n") ? text : `${text}\n`;
}

function writePrivate(file, body) {
  writeFileSync(file, body, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
  const stat = statSync(file);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw coded("private_input_mode");
}

export function materializePrivateProfiles(env, { repoRoot }) {
  const assigned = {};
  const wrote = [];
  const dirRaw = String(env.FOUNDRY_PRIVATE_DIR || "").trim();
  let dir = "";
  if (dirRaw) {
    dir = assertPrivateLocation(dirRaw, repoRoot);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    const stat = statSync(dir);
    if (!stat.isDirectory() || (stat.mode & 0o077) !== 0) throw coded("private_dir_mode");
  }
  for (const [jsonKey, fileKey, name, kind] of FILES) {
    const existing = String(env[fileKey] || "").trim();
    const incoming = env[jsonKey];
    if (existing) {
      assertPrivateLocation(existing, repoRoot);
      continue;
    }
    if (incoming == null || String(incoming).trim() === "") continue;
    if (!dir) throw coded("private_dir_required");
    const body = parsePayload(kind, incoming);
    const file = path.join(dir, name);
    assertPrivateLocation(file, repoRoot);
    try {
      if (statSync(file).isFile()) {
        assigned[fileKey] = file;
        continue;
      }
    } catch {
      // Absent files are created below.
    }
    writePrivate(file, body);
    assigned[fileKey] = file;
    wrote.push(name);
  }
  return { assigned, wrote };
}
