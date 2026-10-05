import { constants, closeSync, fsyncSync, fstatSync, lstatSync, mkdirSync, openSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { X509Certificate } from "node:crypto";
import { assertPrivateLocation, coded, openPrivateParent, readPrivateBytes } from "./private-paths.js";
export { assertPrivateLocation };

export const PROFILE_JSON_KEYS = Object.freeze([
  "FOUNDRY_HOST_PROFILE_JSON", "FOUNDRY_PRIVATE_PROFILE_JSON", "FOUNDRY_PARTICIPATION_KEY", "FOUNDRY_PGSSL_CA_PEM",
]);
const FILES = Object.freeze([
  ["FOUNDRY_HOST_PROFILE_JSON", "FOUNDRY_HOST_PROFILE_FILE", "host-profile.json", "json"],
  ["FOUNDRY_PARTICIPATION_KEY", "FOUNDRY_PARTICIPATION_KEY_FILE", "participation.key", "key"],
  ["FOUNDRY_PRIVATE_PROFILE_JSON", "FOUNDRY_PRIVATE_PROFILE_FILE", "private-profile.json", "json"],
  ["FOUNDRY_PGSSL_CA_PEM", "CORRESPONDENCE_PGSSL_CA_FILE", "prod-ca.pem", "pem"],
]);

function parsePayload(kind, raw) {
  const text = String(raw ?? "");
  if (Buffer.byteLength(text) > (kind === "pem" ? 1024 * 1024 : 65536)) throw coded("private_input_size");
  if (kind === "json") {
    let value;
    try { value = JSON.parse(text); } catch { throw coded("private_profile_json_invalid"); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw coded("private_profile_json_invalid");
    return `${JSON.stringify(value)}\n`;
  }
  if (kind === "key") {
    const key = text.endsWith("\n") ? text.slice(0, -1) : text;
    if (key.length < 32 || key.length > 256 || /[\r\n]/.test(key)) throw coded("participation_key_invalid");
    return `${key}\n`;
  }
  try {
    const certificates = text.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    if (!certificates?.length || certificates.some(cert => !new X509Certificate(cert).ca)) throw new Error();
  } catch { throw coded("pg_ca_unreadable"); }
  return text.endsWith("\n") ? text : `${text}\n`;
}

export function materializePrivateProfiles(env, { repoRoot }) {
  return materializePrivateInputs(env, { repoRoot, files: FILES });
}

// Trusted adapters supply fixed input names. Visitor requests never select these.
export function materializePrivateInputs(env, { repoRoot, files }) {
  const assigned = {}, wrote = [], created = [];
  const dir = String(env.FOUNDRY_PRIVATE_DIR || "").trim();
  // Validate all incoming payloads before creating any directory or file.
  const requests = files.map(([key, fileKey, name, kind]) => {
    const incoming = env[key] == null || String(env[key]).trim() === "" ? null : parsePayload(kind, env[key]);
    const explicit = String(env[fileKey] || "").trim();
    if (!explicit && incoming && !dir) throw coded("private_dir_required");
    return { fileKey, name, kind, incoming, explicit, file: explicit || (incoming ? path.join(dir, name) : null) };
  }).filter(r => r.file);
  let directory;
  try {
    if (dir) {
      // Parent must already exist; do not recursively create or chmod caller paths.
      directory = openPrivateParent(dir, repoRoot);
      try { mkdirSync(directory.entry, { mode: 0o700 }); }
      catch (error) { if (error.code !== "EEXIST") throw error; }
      const fd = openSync(directory.entry, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      closeSync(directory.fd); directory = { fd };
      if ((fstatSync(fd).mode & 0o777) !== 0o700) throw coded("private_dir_mode");
    }
    // Existing inputs, including explicit paths, must be private and match incoming data.
    for (const r of requests) {
      r.parent = openPrivateParent(r.file, repoRoot);
      let stat;
      try { stat = lstatSync(r.parent.entry); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      if (stat) {
        const bytes = readPrivateBytes(r.file, { repoRoot, limit: r.kind === "pem" ? 1024 * 1024 : 65536 });
        const body = parsePayload(r.kind, bytes.toString("utf8"));
        if (r.incoming !== null && body !== r.incoming) throw coded("private_content_mismatch");
        r.present = true;
      } else if (r.explicit) throw coded("private_input_unreadable");
    }
    for (const r of requests) {
      if (!r.present) {
        const fd = openSync(r.parent.entry, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        try {
          const stat = fstatSync(fd);
          created.push({ entry: r.parent.entry, stat });
          if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600) throw coded("private_input_mode");
          writeFileSync(fd, r.incoming);
          fsyncSync(fd);
          fsyncSync(r.parent.fd);
        } finally { closeSync(fd); }
        wrote.push(r.name);
      }
      if (!r.explicit) assigned[r.fileKey] = path.resolve(r.file);
    }
    return { assigned, wrote };
  } catch (error) {
    // Only remove files this invocation created, after verifying their identity.
    for (const item of created.reverse()) {
      try { const now = lstatSync(item.entry); if (now.dev === item.stat.dev && now.ino === item.stat.ino) unlinkSync(item.entry); } catch {}
    }
    throw coded(error.code?.startsWith("private_") || ["participation_key_invalid", "pg_ca_unreadable"].includes(error.code) ? error.code : "private_materialize_failed");
  } finally {
    for (const r of requests) if (r.parent) closeSync(r.parent.fd);
    if (directory) closeSync(directory.fd);
  }
}
