// Shared bounds for the one-shot discovery-log reader and retention command.
// app.js remains the only writer. These modules never append a discovery line.
import fs from "node:fs";
import path from "node:path";
import { DECLARED, ROUTES } from "./log.js";

export const SCHEMA = "samedaydesk.discovery-log.v1";
export const DISCOVERY_CHILD = "discovery-log-v1";
export const DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
export const FILE_RE = /^discovery-([0-9]{4}-[0-9]{2}-[0-9]{2})\.ndjson$/;
export const MAX_BYTES = 1048576;
export const MAX_LINES = 10000;
export const MAX_LINE = 2048;
export const FIELDS = Object.freeze([
  "schema", "stage", "ts", "requestId", "surface", "route", "mcpMethod",
  "requesterId", "callerClass", "qaClaimUnverified", "declaredSource", "declaredSourceDropped",
  "discoveryRef", "discoveryRefWithheld", "discoveryReferrer", "referrerWithheld",
  "journeyDigest", "observedAgentClass", "usefulKind",
]);

const TOKEN = /^[A-Za-z0-9._~-]{16,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGEST = /^hmac-sha256:[0-9a-f]{64}$/;
const SURFACES = new Set(ROUTES.values());
const DECLARED_VALUES = new Set(DECLARED.values());
const OBSERVED = new Set(["claude", "openai", "goose", "cursor", "generic-bot"]);

function closedVocabulary(key, value) {
  if (key === "schema" && value === SCHEMA) return true;
  if (key === "stage" && value === "discovery") return true;
  if (key === "requestId" && UUID.test(value)) return true;
  if (key === "surface" && SURFACES.has(value)) return true;
  if (key === "route" && ROUTES.has(value)) return true;
  if (key === "mcpMethod" && /^[a-z/_]{1,40}$/.test(value)) return true;
  if (key === "declaredSource" && DECLARED_VALUES.has(value)) return true;
  if (key === "observedAgentClass" && OBSERVED.has(value)) return true;
  if (key === "journeyDigest" && DIGEST.test(value)) return true;
  return false;
}

export function absolutePrivatePath(value) {
  return typeof value === "string" && path.isAbsolute(value) && !value.split(path.sep).includes("..");
}

export function validDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const stamp = new Date(Date.UTC(year, month - 1, day));
  return stamp.getUTCFullYear() === year && stamp.getUTCMonth() === month - 1 && stamp.getUTCDate() === day;
}

export function shiftDate(value, days) {
  const [year, month, day] = value.split("-").map(Number);
  const stamp = new Date(Date.UTC(year, month - 1, day));
  stamp.setUTCDate(stamp.getUTCDate() + days);
  return stamp.toISOString().slice(0, 10);
}

/** Local authorization: an enrolled regular file, mode 0600, 32–256 bytes. The bytes are never returned. */
export function assertEnrolledAuthFile(file) {
  if (!absolutePrivatePath(file)) throw new Error("discovery_export_unauthenticated");
  let stat;
  try { stat = fs.lstatSync(file); } catch { throw new Error("discovery_export_unauthenticated"); }
  if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o777) !== 0o600) throw new Error("discovery_export_unauthenticated");
  if (stat.size < 32 || stat.size > 256) throw new Error("discovery_export_unauthenticated");
  const body = fs.readFileSync(file);
  if (body.length < 32 || body.length > 256) throw new Error("discovery_export_unauthenticated");
  body.fill(0);
}

export function resolveDailyFile(dir, date) {
  if (!absolutePrivatePath(dir)) throw new Error("discovery_export_traversal");
  if (typeof date !== "string" || date.includes("..") || date.includes("/") || date.includes("\\")) throw new Error("discovery_export_traversal");
  if (!validDate(date)) throw new Error("discovery_export_unbounded");
  const name = `discovery-${date}.ndjson`;
  let dirStat;
  try { dirStat = fs.lstatSync(dir); } catch { throw new Error("discovery_export_missing"); }
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) throw new Error("discovery_export_traversal");
  const root = fs.realpathSync(dir);
  const file = path.join(root, name);
  let fileStat;
  try { fileStat = fs.lstatSync(file); } catch { throw new Error("discovery_export_missing"); }
  if (fileStat.isSymbolicLink() || !fileStat.isFile()) throw new Error("discovery_export_traversal");
  const resolved = fs.realpathSync(file);
  if (path.dirname(resolved) !== root || path.basename(resolved) !== name) throw new Error("discovery_export_traversal");
  return { root, file: resolved, name, size: fileStat.size };
}

export function projectRecord(record, date, rawLine) {
  if (typeof rawLine === "string" && (rawLine.includes("x-samedaydesk-journey") || Buffer.byteLength(rawLine) > MAX_LINE)) {
    throw new Error(Buffer.byteLength(rawLine) > MAX_LINE ? "discovery_export_unbounded" : "discovery_export_token_refused");
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("discovery_export_record_refused");
  const extra = Object.keys(record).filter(key => !FIELDS.includes(key));
  if (extra.length) {
    const leaked = extra.some(key => /token|journey|secret|authorization/i.test(key) || typeof record[key] === "string" && (TOKEN.test(record[key]) || record[key].includes("x-samedaydesk-journey")));
    throw new Error(leaked ? "discovery_export_token_refused" : "discovery_export_record_refused");
  }
  if (record.schema !== SCHEMA || record.stage !== "discovery") throw new Error("discovery_export_record_refused");
  if (typeof record.ts !== "string" || !record.ts.startsWith(`${date}T`)) throw new Error("discovery_export_record_refused");
  if (!(record.journeyDigest === null || DIGEST.test(record.journeyDigest))) throw new Error("discovery_export_token_refused");
  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "string") continue;
    if (value.includes("x-samedaydesk-journey")) throw new Error("discovery_export_token_refused");
    if (TOKEN.test(value) && !closedVocabulary(key, value)) throw new Error("discovery_export_token_refused");
  }
  const projected = {};
  for (const key of FIELDS) if (Object.hasOwn(record, key)) projected[key] = record[key];
  const line = JSON.stringify(projected);
  if (line.includes("x-samedaydesk-journey") || Buffer.byteLength(line) + 1 > MAX_LINE) throw new Error("discovery_export_token_refused");
  return line;
}
