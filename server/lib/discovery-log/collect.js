// One-shot discovery-log collection. server/app.js remains the only writer of discovery lines.
// This module reads one allowlisted daily file, or unlinks aged daily files. It does not append,
// does not start a resident process, and does not serve a public route.
// The accepted consumer is the vendored Growth continuity function (blob c5db8147). It is not reimplemented here.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { continuity } from "./vendor/growth-619dd6ad/continuity.mjs";

export const SCHEMA = "samedaydesk.discovery-log.v1";
export const COLLECT_DOMAIN = "samedaydesk.discovery-log.collect.v1";
export const JOURNEY_SECRET_PATH = "/workspace/pilot/private/credentials/discovery-journey/hmac.key";
export const MAX_LINE = 2048;
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_LINES = 4096;
export const RETAIN_DAYS = 30;
export const ALLOWED_FIELDS = Object.freeze([
  "schema", "stage", "ts", "requestId", "surface", "route", "mcpMethod",
  "requesterId", "callerClass", "qaClaimUnverified",
  "declaredSource", "declaredSourceDropped",
  "discoveryRef", "discoveryRefWithheld",
  "discoveryReferrer", "referrerWithheld",
  "journeyDigest", "observedAgentClass", "usefulKind",
]);
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAILY = /^discovery-(\d{4}-\d{2}-\d{2})\.ndjson$/;
const DIGEST = /^hmac-sha256:[0-9a-f]{64}$/;
const LEAK = /tok_[A-Za-z0-9._~-]{8,}|bearer\s+\S|x-samedaydesk-journey|BEGIN [A-Z0-9 ]*PRIVATE KEY/i;
const PAID_STAGES = new Set(["quote", "mandate", "capture"]);

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function assertDay(day) {
  const match = DAY.exec(day);
  if (!match) throw coded("DISCOVERY-LOG-TRAVERSAL");
  const year = Number(match[1]), month = Number(match[2]), date = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, date));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== date) throw coded("DISCOVERY-LOG-TRAVERSAL");
  return Date.UTC(year, month - 1, date);
}

export function dayFileName(day) {
  assertDay(day);
  return `discovery-${day}.ndjson`;
}

export function canonicalRequest({ action, day = "", dir = "", out = "", parent = "" }) {
  if (!action || !/^[a-z]{1,16}$/.test(action)) throw coded("DISCOVERY-LOG-USAGE");
  return [action, day, dir ? path.resolve(dir) : "", out ? path.resolve(out) : "", parent ? path.resolve(parent) : ""].join("\0");
}

export function collectProof(secret, canonical) {
  return crypto.createHmac("sha256", secret).update(`${COLLECT_DOMAIN}\0${canonical}`).digest("hex");
}

export function authorize(secret, proof, canonical) {
  const expected = Buffer.from(collectProof(secret, canonical));
  const given = Buffer.from(String(proof ?? ""), "utf8");
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) throw coded("DISCOVERY-LOG-UNAUTHENTICATED");
}

export function readAuthSecret(file) {
  if (typeof file !== "string" || !path.isAbsolute(file) || file.split(path.sep).includes("..")) throw coded("DISCOVERY-LOG-UNAUTHENTICATED");
  if (path.resolve(file) === JOURNEY_SECRET_PATH) throw coded("DISCOVERY-LOG-AUTH-REFUSED");
  let fd;
  try { fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
  catch { throw coded("DISCOVERY-LOG-UNAUTHENTICATED"); }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600) throw coded("DISCOVERY-LOG-UNAUTHENTICATED");
    if (stat.size < 32 || stat.size > 256) throw coded("DISCOVERY-LOG-UNAUTHENTICATED");
    const buf = Buffer.alloc(stat.size);
    if (fs.readSync(fd, buf, 0, stat.size, 0) !== stat.size) throw coded("DISCOVERY-LOG-UNAUTHENTICATED");
    let text = buf.toString("utf8");
    if (text.endsWith("\n")) text = text.slice(0, -1);
    if (text.length < 32 || /[\r\n\0]/.test(text)) throw coded("DISCOVERY-LOG-UNAUTHENTICATED");
    return text;
  } finally { fs.closeSync(fd); }
}

function openLogDir(dir) {
  if (typeof dir !== "string" || !path.isAbsolute(dir) || dir.split(path.sep).includes("..")) throw coded("DISCOVERY-LOG-TRAVERSAL");
  let listed;
  try { listed = fs.lstatSync(dir); }
  catch { throw coded("DISCOVERY-LOG-TRAVERSAL"); }
  if (!listed.isDirectory() || listed.isSymbolicLink() || (listed.mode & 0o777) !== 0o700) throw coded(listed.isDirectory() && !listed.isSymbolicLink() ? "DISCOVERY-LOG-DIR-MODE" : "DISCOVERY-LOG-TRAVERSAL");
  const real = fs.realpathSync(dir);
  if (real !== path.resolve(dir)) throw coded("DISCOVERY-LOG-TRAVERSAL");
  const fd = fs.openSync(dir, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  return { fd, real };
}

function leaks(value, secret) {
  if (typeof value !== "string") return false;
  if (LEAK.test(value)) return true;
  return Boolean(secret) && value.includes(secret);
}

function allowRecord(raw, secret) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw coded("DISCOVERY-LOG-RECORD");
  if (raw.schema !== SCHEMA || raw.stage !== "discovery") throw coded("DISCOVERY-LOG-RECORD");
  for (const value of Object.values(raw)) {
    if (value !== null && typeof value !== "string" && typeof value !== "boolean") throw coded("DISCOVERY-LOG-RECORD");
    if (leaks(value, secret)) throw coded("DISCOVERY-LOG-TOKEN-LEAK");
  }
  if (raw.journeyDigest != null && !DIGEST.test(raw.journeyDigest)) throw coded("DISCOVERY-LOG-TOKEN-LEAK");
  const out = {};
  for (const key of ALLOWED_FIELDS) if (Object.prototype.hasOwnProperty.call(raw, key)) out[key] = raw[key];
  return out;
}

function parseNdjson(buf, mapLine) {
  const text = buf.toString("utf8");
  if (text.includes("\0")) throw coded("DISCOVERY-LOG-RECORD");
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.length > MAX_LINES) throw coded("DISCOVERY-LOG-OVERSIZE");
  const rows = [];
  for (const line of lines) {
    if (line.length === 0) continue;
    if (Buffer.byteLength(line) + 1 > MAX_LINE) throw coded("DISCOVERY-LOG-OVERSIZE");
    let raw;
    try { raw = JSON.parse(line); }
    catch { throw coded("DISCOVERY-LOG-RECORD"); }
    rows.push(mapLine(raw));
  }
  return rows;
}

function readBounded(dirFd, name) {
  let fd;
  try { fd = fs.openSync(`/proc/self/fd/${dirFd}/${name}`, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
  catch (error) {
    if (error.code === "ENOENT") return null;
    throw coded("DISCOVERY-LOG-TRAVERSAL");
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw coded("DISCOVERY-LOG-TRAVERSAL");
    if ((stat.mode & 0o077) !== 0) throw coded("DISCOVERY-LOG-FILE-MODE");
    if (stat.size > MAX_FILE_BYTES) throw coded("DISCOVERY-LOG-OVERSIZE");
    const buf = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < stat.size) {
      const count = fs.readSync(fd, buf, offset, stat.size - offset, offset);
      if (count === 0) throw coded("DISCOVERY-LOG-OVERSIZE");
      offset += count;
    }
    return buf;
  } finally { fs.closeSync(fd); }
}

function assertOutside(realDir, file) {
  if (typeof file !== "string" || !path.isAbsolute(file) || file.split(path.sep).includes("..")) throw coded("DISCOVERY-LOG-TRAVERSAL");
  const resolved = path.resolve(file);
  if (resolved === realDir || resolved.startsWith(`${realDir}${path.sep}`)) throw coded("DISCOVERY-LOG-TRAVERSAL");
  const parent = path.dirname(resolved);
  let listed;
  try { listed = fs.lstatSync(parent); }
  catch { throw coded("DISCOVERY-LOG-TRAVERSAL"); }
  if (!listed.isDirectory() || listed.isSymbolicLink() || fs.realpathSync(parent) !== path.resolve(parent)) throw coded("DISCOVERY-LOG-TRAVERSAL");
  return resolved;
}

function writePrivate(file, body) {
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try {
    fs.writeFileSync(fd, body);
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
}

function readOutside(realDir, file, secret) {
  const resolved = assertOutside(realDir, file);
  let fd;
  try { fd = fs.openSync(resolved, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
  catch { throw coded("DISCOVERY-LOG-TRAVERSAL"); }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw coded("DISCOVERY-LOG-TRAVERSAL");
    if ((stat.mode & 0o077) !== 0) throw coded("DISCOVERY-LOG-FILE-MODE");
    if (stat.size > MAX_FILE_BYTES) throw coded("DISCOVERY-LOG-OVERSIZE");
    const buf = Buffer.alloc(stat.size);
    if (stat.size && fs.readSync(fd, buf, 0, stat.size, 0) !== stat.size) throw coded("DISCOVERY-LOG-OVERSIZE");
    return parseNdjson(buf, (raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw) || !PAID_STAGES.has(raw.stage)) throw coded("DISCOVERY-LOG-RECORD");
      for (const value of Object.values(raw)) if (leaks(value, secret)) throw coded("DISCOVERY-LOG-TOKEN-LEAK");
      return raw;
    });
  } finally { fs.closeSync(fd); }
}

export function exportDay({ dir, day, out, secret, proof, consumePaid }) {
  authorize(secret, proof, canonicalRequest({ action: "export", day, dir, out }));
  const opened = openLogDir(dir);
  try {
    const target = assertOutside(opened.real, out);
    const name = dayFileName(day);
    const paid = consumePaid ? readOutside(opened.real, consumePaid, secret) : null;
    const buf = readBounded(opened.fd, name);
    const records = buf ? parseNdjson(buf, (raw) => allowRecord(raw, secret)) : [];
    const body = records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : "");
    writePrivate(target, body);
    const receipt = {
      schema: "samedaydesk.discovery-log.collection.v1", action: "export", day,
      absent: !buf, exported: records.length, out: target,
    };
    if (paid) {
      const joined = continuity(records, paid);
      const joinedPath = `${target}.continuity.json`;
      writePrivate(joinedPath, `${JSON.stringify(joined)}\n`);
      receipt.continuityOut = joinedPath;
      receipt.continuityRows = joined.rows.length;
      receipt.continuityErrors = joined.errors;
    }
    return receipt;
  } finally { fs.closeSync(opened.fd); }
}

export function retainDays({ dir, today, secret, proof }) {
  authorize(secret, proof, canonicalRequest({ action: "retain", day: today, dir }));
  assertDay(today);
  const opened = openLogDir(dir);
  try {
    const names = fs.readdirSync(opened.real);
    const remove = [];
    for (const name of names) {
      const match = DAILY.exec(name);
      if (!match) continue;
      const full = path.join(opened.real, name);
      const listed = fs.lstatSync(full);
      if (listed.isSymbolicLink() || !listed.isFile()) throw coded("DISCOVERY-LOG-TRAVERSAL");
      if (fs.realpathSync(full) !== full) throw coded("DISCOVERY-LOG-TRAVERSAL");
      const age = Math.round((assertDay(today) - assertDay(match[1])) / 86400000);
      if (age > RETAIN_DAYS) remove.push(full);
    }
    for (const full of remove) fs.unlinkSync(full);
    return {
      schema: "samedaydesk.discovery-log.collection.v1", action: "retain", today,
      retainDays: RETAIN_DAYS, removed: remove.map((full) => path.basename(full).slice(10, 20)),
    };
  } finally { fs.closeSync(opened.fd); }
}

export function probePrivateDir({ parent, dir, secret, proof }) {
  authorize(secret, proof, canonicalRequest({ action: "probe", dir, parent }));
  const opened = openLogDir(dir);
  fs.closeSync(opened.fd);
  if (typeof parent !== "string" || !path.isAbsolute(parent) || parent.split(path.sep).includes("..")) throw coded("DISCOVERY-LOG-TRAVERSAL");
  const parentStat = fs.lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || (parentStat.mode & 0o777) !== 0o700) throw coded("DISCOVERY-LOG-DIR-MODE");
  const parentReal = fs.realpathSync(parent);
  if (parentReal !== path.resolve(parent)) throw coded("DISCOVERY-LOG-TRAVERSAL");
  if (opened.real !== parentReal && !opened.real.startsWith(`${parentReal}${path.sep}`)) throw coded("DISCOVERY-LOG-TRAVERSAL");
  const probe = path.join(parentReal, ".collection-writer-probe");
  const nonce = crypto.randomBytes(16).toString("hex");
  const fd = fs.openSync(probe, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try {
    fs.writeFileSync(fd, nonce);
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  try {
    const back = fs.readFileSync(probe, "utf8");
    if (back !== nonce) throw coded("DISCOVERY-LOG-PROBE");
  } finally { fs.unlinkSync(probe); }
  return { schema: "samedaydesk.discovery-log.collection-probe.v1", writable: true, persistent: true, dirMode: "0700", parentMode: "0700" };
}

function parsedArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) { out._.push(arg); continue; }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw coded("DISCOVERY-LOG-USAGE");
    out[arg.slice(2)] = value;
    i += 1;
  }
  return out;
}

function main(argv) {
  const args = parsedArgs(argv);
  const action = args._[0];
  if (action === "proof") {
    const secret = readAuthSecret(args["auth-file"]);
    process.stdout.write(`${collectProof(secret, canonicalRequest({
      action: args.action, day: args.day || args.today || "", dir: args.dir, out: args.out, parent: args.parent,
    }))}\n`);
    return;
  }
  const secret = readAuthSecret(args["auth-file"]);
  if (action === "export") {
    console.log(JSON.stringify(exportDay({
      dir: args.dir, day: args.day, out: args.out, secret, proof: args.proof, consumePaid: args["consume-paid"],
    })));
    return;
  }
  if (action === "retain") {
    console.log(JSON.stringify(retainDays({ dir: args.dir, today: args.today, secret, proof: args.proof })));
    return;
  }
  if (action === "probe") {
    console.log(JSON.stringify(probePrivateDir({ parent: args.parent, dir: args.dir, secret, proof: args.proof })));
    return;
  }
  throw coded("DISCOVERY-LOG-USAGE");
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    console.error(error.code || "DISCOVERY-LOG-COLLECT-REFUSED");
    process.exitCode = 1;
  }
}
