import { constants, closeSync, fstatSync, openSync, readFileSync, writeFileSync, fsyncSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";

export function showHelp(usage) {
  if (process.argv.length === 3 && process.argv[2] === "--help") {
    process.stdout.write(`Usage: ${usage}\n`);
    process.exit(0);
  }
}

export function privateText(file, limit = 524288) {
  if (!isAbsolute(file || "")) throw new Error("absolute_private_file_required");
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) || stat.size > limit) throw new Error("invalid_private_file");
    return readFileSync(fd, "utf8");
  } finally { closeSync(fd); }
}
export function inputText(file) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 131072) throw new Error("invalid_input_file");
    return readFileSync(fd, "utf8");
  } finally { closeSync(fd); }
}
export function savePrivate(file, text, { exclusive = false } = {}) {
  if (!isAbsolute(file || "")) throw new Error("absolute_private_file_required");
  const target = exclusive ? file : `${file}.${randomUUID()}.tmp`;
  const fd = openSync(target, "wx", 0o600);
  try { writeFileSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
  if (!exclusive) renameSync(target, file);
}
export function argumentsFor(argv, allowed, flags = []) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "");
    if (!argv[i].startsWith("--") || result[key] !== undefined || !allowed.includes(key)) throw new Error("invalid_arguments");
    if (flags.includes(key)) result[key] = true;
    else { const value = argv[++i]; if (!value || value.startsWith("--")) throw new Error("invalid_arguments"); result[key] = value; }
  }
  return result;
}
export function baseUrl(raw, allowLoopback) {
  const url = new URL(raw);
  const local = ["127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/api/machine-gateway" ||
      !(url.protocol === "https:" || (url.protocol === "http:" && local && allowLoopback))) throw new Error("invalid_base_url");
  return url.href;
}
export async function request(base, path, { token, body, key } = {}) {
  const response = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET", redirect: "manual", signal: AbortSignal.timeout(15000),
    headers: { accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}), ...(key ? { "idempotency-key": key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error(`gateway_http_${response.status}`);
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength;
      if (size > 524288) { await reader.cancel(); throw new Error("gateway_response_too_large"); }
      chunks.push(Buffer.from(next.value));
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
