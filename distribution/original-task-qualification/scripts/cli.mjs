#!/usr/bin/env node
// Qualify one public original task by extracting the pinned correspondence client.
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const SCHEMA = "samedaydesk.original-task-qualification-skill.v1";
const COMMANDS = new Set(["acquire", "describe", "map", "submit", "read"]);
const PAYMENT_FLAGS = new Set(["--pay", "--settle", "--sign", "--wallet", "--purchase"]);
const DROPPED = new Set([
  "authorization",
  "bearer",
  "email",
  "password",
  "proof",
  "projectid",
  "registrationid",
  "secret",
  "token",
]);
const EXPECTED = {
  schema: "samedaydesk.original-task-qualification-pins.v1",
  origin: "https://samedaydesk.com",
  discoveryPath: "/discovery/original-task-correspondence.json",
  archivePath: "/for-agents/original-task/original-task-client.tar.gz",
  sha256: "9b5b9bf82119d7c8c0d4e277e34e85f6e9c0711ed4cfc84017c7a79b47bed887",
  bytes: 23811,
  basePath: "/api/correspondence",
  client: "server/lib/original-task/cli.mjs",
};

function blank(command) {
  return {
    schema: SCHEMA,
    command,
    acquisition: null,
    encounter: null,
    install: null,
    registration: null,
    submission: null,
    disposition: null,
    delivery: null,
    acceptance: null,
    payment: null,
    repeatUse: null,
    result: null,
    error: null,
  };
}

function emit(observation, code) {
  console.log(JSON.stringify(observation));
  if (code) process.exitCode = 1;
}

function fail(observation, code) {
  observation.error = { code };
  emit(observation, code);
}

function safeCode(value, fallback = "request_failed") {
  return typeof value === "string" && /^[a-z0-9_]{1,80}$/.test(value) ? value : fallback;
}

function flag(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

function redact(value, depth = 0) {
  if (depth > 6) return null;
  if (typeof value === "string") {
    if (value.length > 8000) return "[redacted]";
    return value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  }
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (DROPPED.has(key.toLowerCase())) continue;
    out[key] = redact(item, depth + 1);
  }
  return out;
}

function loadPins() {
  const file = fileURLToPath(new URL("../references/pins.json", import.meta.url));
  const info = lstatSync(file);
  if (!info.isFile() || info.size < 1 || info.size > 8192) {
    throw Object.assign(new Error("pins"), { code: "pins_refused" });
  }
  const pins = JSON.parse(readFileSync(file, "utf8"));
  const archive = pins?.archive;
  const discovery = pins?.discovery;
  if (pins?.schema !== EXPECTED.schema) throw Object.assign(new Error("pins"), { code: "pins_refused" });
  if (discovery?.origin !== EXPECTED.origin || discovery?.pathname !== EXPECTED.discoveryPath) {
    throw Object.assign(new Error("pins"), { code: "pins_refused" });
  }
  if (archive?.pathname !== EXPECTED.archivePath || archive?.sha256 !== EXPECTED.sha256 || archive?.bytes !== EXPECTED.bytes) {
    throw Object.assign(new Error("pins"), { code: "pins_refused" });
  }
  if (pins.basePath !== EXPECTED.basePath || pins.client !== EXPECTED.client) {
    throw Object.assign(new Error("pins"), { code: "pins_refused" });
  }
  return pins;
}

function skillRoot() {
  return realpathSync(fileURLToPath(new URL("..", import.meta.url)));
}

function nodeSupported() {
  const major = Number(process.versions.node.split(".")[0]);
  return major >= 22;
}

function flagsOf(rest) {
  const flags = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (typeof key !== "string" || !key.startsWith("--") || key.length > 40) return { error: "arguments_rejected" };
    if (typeof value !== "string" || value.startsWith("--") || value.length > 2048) return { error: "arguments_rejected" };
    if (flags.has(key)) return { error: "arguments_rejected" };
    flags.set(key, value);
  }
  return { flags };
}

function unknownFlag(flags, allowed) {
  for (const key of flags.keys()) {
    if (!allowed.includes(key)) return "arguments_rejected";
  }
  return null;
}

function timeoutOf(flags) {
  if (!flags.has("--timeout-ms")) return 20000;
  const value = flags.get("--timeout-ms");
  if (!/^[0-9]+$/.test(value)) return { error: "arguments_rejected" };
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 60000) return { error: "arguments_rejected" };
  return timeout;
}

function loopback(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function parseUrl(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

function allowedDiscovery(value) {
  const url = parseUrl(value);
  if (!url || url.pathname !== EXPECTED.discoveryPath) return null;
  if (url.origin === EXPECTED.origin && url.protocol === "https:") return url;
  if (url.protocol === "http:" && loopback(url.hostname)) return url;
  return null;
}

function allowedArchive(value, discoveryUrl) {
  const url = parseUrl(value);
  if (!url || url.pathname !== EXPECTED.archivePath) return null;
  if (url.origin === EXPECTED.origin && url.protocol === "https:") return url;
  if (url.origin === discoveryUrl.origin && url.protocol === "http:" && loopback(url.hostname)) return url;
  return null;
}

function allowedBase(value) {
  const url = parseUrl(value);
  if (!url || url.pathname !== EXPECTED.basePath) return null;
  if (url.origin === EXPECTED.origin && url.protocol === "https:") return url.href;
  if (url.protocol === "http:" && loopback(url.hostname)) return url.href;
  return null;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function regularFile(file) {
  try {
    const info = lstatSync(file);
    return info.isFile() ? info : null;
  } catch {
    return null;
  }
}

async function readLimited(response, maxBytes) {
  if (!response.body) return { ok: true, bytes: Buffer.alloc(0) };
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const step = await reader.read();
    if (step.done) break;
    total += step.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, error: "oversized" };
    }
    chunks.push(Buffer.from(step.value));
  }
  return { ok: true, bytes: Buffer.concat(chunks) };
}

async function fetchBytes(url, maxBytes, timeoutMs) {
  let response;
  try {
    response = await fetch(url, {
      redirect: "manual",
      headers: { accept: "application/octet-stream, application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { error: "unavailable" };
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    return { error: "redirect_refused" };
  }
  if (response.status !== 200) {
    await response.body?.cancel();
    return { error: "unavailable" };
  }
  try {
    const body = await readLimited(response, maxBytes);
    if (!body.ok) return { error: "oversized" };
    return { ok: true, bytes: body.bytes };
  } catch {
    return { error: "unavailable" };
  }
}

function inspectTar(gzipped) {
  let raw;
  try {
    raw = gunzipSync(gzipped, { maxOutputLength: 2_000_000 });
  } catch {
    return { ok: false };
  }
  const names = [];
  let offset = 0;
  while (offset + 512 <= raw.length) {
    const header = raw.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.toString("utf8", 0, 100).replace(/\0.*$/, "");
    const prefix = header.toString("utf8", 345, 500).replace(/\0.*$/, "");
    const member = prefix ? `${prefix}/${name}` : name;
    const size = Number.parseInt(header.toString("utf8", 124, 136).replace(/\0.*$/, "").trim(), 8);
    const typeflag = header[156];
    if (!member || !Number.isInteger(size) || size < 0 || size > 1_000_000) return { ok: false };
    if (member.startsWith("/") || member.split("/").includes("..") || member.includes("\\")) return { ok: false };
    if (typeflag !== 48 && typeflag !== 0) return { ok: false };
    names.push(member);
    const end = offset + 512 + size;
    if (end > raw.length) return { ok: false };
    offset = offset + 512 + (Math.ceil(size / 512) * 512);
  }
  if (!names.includes(EXPECTED.client)) return { ok: false };
  return { ok: true };
}

function prepareCache(cachePath) {
  if (!cachePath) return { error: "arguments_required" };
  const parent = dirname(resolve(cachePath));
  let parentInfo;
  try { parentInfo = lstatSync(parent); }
  catch { return { error: "cache_refused" }; }
  if (!parentInfo.isDirectory()) return { error: "cache_refused" };
  if (existsPath(cachePath)) {
    const info = lstatSync(cachePath);
    if (!info.isDirectory()) return { error: "cache_refused" };
  } else {
    mkdirSync(cachePath, { mode: 0o700 });
  }
  const cache = realpathSync(cachePath);
  const root = skillRoot();
  const rootPrefix = root.endsWith(sep) ? root : root + sep;
  if (cache === root || cache.startsWith(rootPrefix)) return { error: "cache_refused" };
  return { cache };
}

function existsPath(file) {
  try {
    lstatSync(file);
    return true;
  } catch {
    return false;
  }
}

function cacheReady(cache) {
  const archive = regularFile(join(cache, "original-task-client.tar.gz"));
  const discovery = regularFile(join(cache, "discovery.json"));
  const cli = regularFile(join(cache, "client", EXPECTED.client));
  if (!archive || !discovery || !cli) return false;
  if (archive.size !== EXPECTED.bytes) return false;
  const bytes = readFileSync(join(cache, "original-task-client.tar.gz"));
  return sha256(bytes) === EXPECTED.sha256;
}

function containedExtract(clientRoot) {
  const base = realpathSync(clientRoot);
  const pending = [base];
  while (pending.length) {
    const current = pending.pop();
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      const info = lstatSync(full);
      if (info.isSymbolicLink()) return false;
      if (info.isDirectory()) pending.push(full);
      else if (!info.isFile()) return false;
    }
  }
  const cli = realpathSync(join(clientRoot, EXPECTED.client));
  const prefix = base.endsWith(sep) ? base : base + sep;
  return cli.startsWith(prefix);
}

function outsideSkill(directory) {
  try {
    const real = realpathSync(directory);
    const root = skillRoot();
    const prefix = root.endsWith(sep) ? root : root + sep;
    return real !== root && !real.startsWith(prefix);
  } catch {
    return false;
  }
}

function extractArchive(cache, bytes) {
  const clientRoot = join(cache, "client");
  rmSync(clientRoot, { recursive: true, force: true });
  mkdirSync(clientRoot, { mode: 0o700 });
  writeFileSync(join(cache, "package.json"), `${JSON.stringify({ private: true, type: "commonjs" })}\n`, { mode: 0o644 });
  const archivePath = join(cache, "original-task-client.tar.gz");
  writeFileSync(archivePath, bytes, { mode: 0o644 });
  return new Promise((resolvePromise) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    };
    const child = spawn("tar", ["-xzf", archivePath, "-C", clientRoot], {
      cwd: tmpdir(),
      stdio: ["ignore", "ignore", "pipe"],
    });
    child.stderr.on("data", () => {});
    child.once("error", () => finish({ error: "tar_required" }));
    child.once("exit", (code) => {
      if (code !== 0) {
        rmSync(clientRoot, { recursive: true, force: true });
        finish({ error: "archive_refused" });
        return;
      }
      if (!containedExtract(clientRoot)) {
        rmSync(clientRoot, { recursive: true, force: true });
        finish({ error: "archive_refused" });
        return;
      }
      finish({ clientRoot });
    });
  });
}

function registrationCode(directory) {
  if (!directory) return null;
  const info = regularFile(join(directory, "registration.secret"));
  if (!info || info.size < 32 || info.size > 200) return "absent";
  return "present";
}

function continuationPresent(directory) {
  const info = regularFile(join(directory, "continuation.json"));
  return Boolean(info && info.size > 1 && info.size <= 65536);
}

function taskFileOk(file) {
  const info = regularFile(file);
  return Boolean(info && info.size > 1 && info.size <= 65536);
}

function rememberSource(cache, descriptorUrl, discoveryBytes) {
  writeFileSync(join(cache, "discovery.json"), discoveryBytes, { mode: 0o644 });
  writeFileSync(join(cache, "source.json"), `${JSON.stringify({ descriptorUrl })}\n`, { mode: 0o644 });
}

function savedEncounter(cache) {
  try {
    const source = JSON.parse(readFileSync(join(cache, "source.json"), "utf8"));
    const discovery = JSON.parse(readFileSync(join(cache, "discovery.json"), "utf8"));
    return {
      acquisition: {
        source: "cache",
        sha256: EXPECTED.sha256,
        bytes: EXPECTED.bytes,
        matched: true,
        fetched: false,
      },
      encounter: {
        descriptorUrl: typeof source.descriptorUrl === "string" ? source.descriptorUrl : null,
        schema: typeof discovery.schema === "string" ? discovery.schema : null,
      },
      install: { clientExtracted: true, client: EXPECTED.client },
    };
  } catch {
    return null;
  }
}

function applySaved(observation, saved) {
  if (!saved) return;
  observation.acquisition = saved.acquisition;
  observation.encounter = saved.encounter;
  observation.install = saved.install;
}

function applyDecision(observation, parsed) {
  observation.result = redact(parsed);
  observation.disposition = {
    action: typeof parsed.action === "string" ? parsed.action : null,
    code: typeof parsed.code === "string" ? parsed.code : null,
  };
  observation.delivery = { delivered: null, promised: flag(parsed.deliveryPromise) };
  observation.acceptance = { accepted: flag(parsed.acceptance) };
  observation.payment = { payment: flag(parsed.payment) };
}

function applyReceipt(observation, parsed) {
  observation.result = redact(parsed);
  observation.disposition = {
    stage: typeof parsed.stage === "string" ? parsed.stage : null,
    disposition: typeof parsed.disposition === "string" ? parsed.disposition : null,
  };
  observation.delivery = { delivered: flag(parsed.delivered), promised: flag(parsed.deliveryPromise) };
  observation.acceptance = { accepted: flag(parsed.accepted) };
  observation.payment = { payment: flag(parsed.payment) };
  observation.submission = { submitted: flag(parsed.submitted), intentional: true };
}

function applyDescriptor(observation, parsed) {
  observation.result = redact(parsed);
  observation.delivery = { delivered: null, promised: flag(parsed.deliveryPromise) };
  observation.acceptance = { accepted: flag(parsed.acceptance) };
  observation.payment = { payment: flag(parsed.payment) };
}

function runClient(clientRoot, args, timeoutMs) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [join(clientRoot, EXPECTED.client), ...args], {
      cwd: clientRoot,
      env: {
        PATH: process.env.PATH || "",
        HOME: process.env.HOME || "",
        TMPDIR: process.env.TMPDIR || tmpdir(),
        LANG: "C.UTF-8",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 1_000_000) child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 64_000) child.kill("SIGTERM");
    });
    child.once("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ error: "client_failed" });
    });
    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) {
        resolvePromise({ error: "client_timeout" });
        return;
      }
      resolvePromise({ code, stdout, stderr });
    });
  });
}

function parseClient(result) {
  if (result.error) return { error: result.error };
  const line = result.stdout.trim();
  if (result.code === 0) {
    try {
      const parsed = JSON.parse(line);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: "client_output" };
      return { parsed };
    } catch {
      return { error: "client_output" };
    }
  }
  try {
    const parsed = JSON.parse(result.stderr.trim());
    return { error: safeCode(parsed?.error?.code) };
  } catch {
    return { error: "request_failed" };
  }
}

async function acquireInto(observation, cache, discoveryUrl, timeoutMs, refresh) {
  if (!refresh && cacheReady(cache)) {
    const saved = savedEncounter(cache);
    if (!saved) return "cache_refused";
    applySaved(observation, saved);
    return null;
  }
  const fetched = await fetchBytes(discoveryUrl, 262144, timeoutMs);
  observation.encounter = { descriptorUrl: discoveryUrl.href, schema: null };
  if (fetched.error === "redirect_refused") return "redirect_refused";
  if (fetched.error) return "descriptor_unavailable";
  let discovery;
  try { discovery = JSON.parse(fetched.bytes.toString("utf8")); }
  catch { return "descriptor_unavailable"; }
  if (!discovery || typeof discovery !== "object" || Array.isArray(discovery)) return "descriptor_unavailable";
  observation.encounter.schema = typeof discovery.schema === "string" ? discovery.schema : null;
  const claimed = discovery.acquisition?.archive;
  if (!claimed || claimed.sha256 !== EXPECTED.sha256 || claimed.bytes !== EXPECTED.bytes || claimed.path !== EXPECTED.archivePath) {
    observation.acquisition = {
      source: "public-archive",
      sha256: typeof claimed?.sha256 === "string" ? claimed.sha256 : null,
      bytes: Number.isInteger(claimed?.bytes) ? claimed.bytes : null,
      matched: false,
      fetched: false,
    };
    return "stale_discovery";
  }
  const archiveUrl = allowedArchive(claimed.url, discoveryUrl);
  if (!archiveUrl) return "archive_refused";
  const archive = await fetchBytes(archiveUrl, EXPECTED.bytes, timeoutMs);
  if (archive.error === "redirect_refused") return "redirect_refused";
  if (!archive.ok) {
    observation.acquisition = {
      source: "public-archive",
      sha256: null,
      bytes: null,
      matched: false,
      fetched: true,
    };
    return "archive_refused";
  }
  const digest = sha256(archive.bytes);
  if (archive.bytes.length !== EXPECTED.bytes || digest !== EXPECTED.sha256 || !inspectTar(archive.bytes).ok) {
    observation.acquisition = {
      source: "public-archive",
      sha256: digest,
      bytes: archive.bytes.length,
      matched: false,
      fetched: true,
    };
    return "archive_refused";
  }
  const extracted = await extractArchive(cache, archive.bytes);
  if (extracted.error) return extracted.error;
  rememberSource(cache, discoveryUrl.href, fetched.bytes);
  observation.acquisition = {
    source: "public-archive",
    sha256: digest,
    bytes: archive.bytes.length,
    matched: true,
    fetched: true,
  };
  observation.install = { clientExtracted: true, client: EXPECTED.client };
  return null;
}

async function ensure(observation, flags, timeoutMs, { fetchable }) {
  const prepared = prepareCache(flags.get("--cache"));
  if (prepared.error) return prepared.error;
  const refresh = flags.get("--refresh") === "yes";
  if (!refresh && cacheReady(prepared.cache)) {
    const saved = savedEncounter(prepared.cache);
    if (!saved) return "cache_refused";
    applySaved(observation, saved);
    return { cache: prepared.cache };
  }
  if (!fetchable) return "cache_required";
  const discoveryValue = flags.get("--discovery-url") || `${EXPECTED.origin}${EXPECTED.discoveryPath}`;
  const discoveryUrl = allowedDiscovery(discoveryValue);
  if (!discoveryUrl) return "origin_refused";
  const failed = await acquireInto(observation, prepared.cache, discoveryUrl, timeoutMs, true);
  if (failed) return failed;
  return { cache: prepared.cache };
}

async function commandAcquire(observation, flags, timeoutMs) {
  const rejected = unknownFlag(flags, ["--cache", "--discovery-url", "--timeout-ms", "--refresh"]);
  if (rejected) return fail(observation, rejected);
  const ensured = await ensure(observation, flags, timeoutMs, { fetchable: true });
  if (typeof ensured === "string") return fail(observation, ensured);
  emit(observation);
}

async function commandDescribe(observation, flags, timeoutMs) {
  const rejected = unknownFlag(flags, ["--cache", "--discovery-url", "--timeout-ms", "--refresh"]);
  if (rejected) return fail(observation, rejected);
  const ensured = await ensure(observation, flags, timeoutMs, { fetchable: true });
  if (typeof ensured === "string") return fail(observation, ensured);
  const ran = await runClient(join(ensured.cache, "client"), ["describe"], timeoutMs);
  const parsed = parseClient(ran);
  if (parsed.error) return fail(observation, parsed.error);
  applyDescriptor(observation, parsed.parsed);
  emit(observation);
}

async function commandMap(observation, flags, timeoutMs) {
  const rejected = unknownFlag(flags, ["--cache", "--discovery-url", "--timeout-ms", "--refresh", "--task-file", "--directory", "--handle"]);
  if (rejected) return fail(observation, rejected);
  const taskFile = flags.get("--task-file");
  if (!taskFile || !taskFileOk(taskFile)) return fail(observation, "arguments_required");
  const ensured = await ensure(observation, flags, timeoutMs, { fetchable: true });
  if (typeof ensured === "string") return fail(observation, ensured);
  const args = [
    "map",
    "--discovery-file", join(ensured.cache, "discovery.json"),
    "--archive", join(ensured.cache, "original-task-client.tar.gz"),
    "--task-file", taskFile,
  ];
  if (flags.has("--directory")) {
    const directory = flags.get("--directory");
    if (existsPath(directory) && !outsideSkill(directory)) return fail(observation, "arguments_rejected");
    args.push("--directory", directory);
  }
  if (flags.has("--handle")) args.push("--handle", flags.get("--handle"));
  const ran = await runClient(join(ensured.cache, "client"), args, timeoutMs);
  const parsed = parseClient(ran);
  if (parsed.error) return fail(observation, parsed.error);
  applyDecision(observation, parsed.parsed);
  if (flags.has("--directory")) observation.registration = { code: registrationCode(flags.get("--directory")) };
  emit(observation);
}

async function commandSubmit(observation, flags, timeoutMs) {
  const rejected = unknownFlag(flags, ["--cache", "--discovery-url", "--timeout-ms", "--refresh", "--task-file", "--directory", "--base-url", "--submit"]);
  if (rejected) return fail(observation, rejected);
  if (flags.get("--submit") !== "yes") return fail(observation, "submission_required");
  const taskFile = flags.get("--task-file");
  const directory = flags.get("--directory");
  const base = allowedBase(flags.get("--base-url") || "");
  if (!taskFile || !taskFileOk(taskFile) || !directory || !base) return fail(observation, !base && flags.has("--base-url") ? "origin_refused" : "arguments_required");
  const directoryInfo = lstatSyncOrNull(directory);
  if (!directoryInfo?.isDirectory()) {
    return fail(observation, directoryInfo?.isSymbolicLink() ? "missing_private_authority" : "arguments_required");
  }
  if (!outsideSkill(directory)) return fail(observation, "arguments_rejected");
  const ensured = await ensure(observation, flags, timeoutMs, { fetchable: true });
  if (typeof ensured === "string") return fail(observation, ensured);
  const ran = await runClient(join(ensured.cache, "client"), [
    "submit",
    "--base-url", base,
    "--directory", directory,
    "--task-file", taskFile,
  ], timeoutMs);
  const parsed = parseClient(ran);
  observation.registration = { code: registrationCode(directory) };
  if (parsed.error) return fail(observation, parsed.error);
  applyReceipt(observation, parsed.parsed);
  emit(observation);
}

function lstatSyncOrNull(file) {
  try { return lstatSync(file); }
  catch { return null; }
}

async function commandRead(observation, flags, timeoutMs) {
  const rejected = unknownFlag(flags, ["--cache", "--timeout-ms", "--directory"]);
  if (rejected) return fail(observation, rejected);
  const directory = flags.get("--directory");
  if (!directory) return fail(observation, "arguments_required");
  const directoryInfo = lstatSyncOrNull(directory);
  if (directoryInfo?.isSymbolicLink()) return fail(observation, "missing_private_authority");
  if (directoryInfo && !outsideSkill(directory)) return fail(observation, "arguments_rejected");
  const repeat = continuationPresent(directory);
  const ensured = await ensure(observation, flags, timeoutMs, { fetchable: false });
  if (typeof ensured === "string") return fail(observation, ensured);
  const ran = await runClient(join(ensured.cache, "client"), ["read", "--directory", directory], timeoutMs);
  const parsed = parseClient(ran);
  observation.registration = { code: registrationCode(directory) };
  if (repeat) observation.repeatUse = { samePrivateDirectory: true };
  if (parsed.error) return fail(observation, parsed.error);
  applyReceipt(observation, parsed.parsed);
  observation.submission = null;
  emit(observation);
}

async function main() {
  const argv = process.argv.slice(2);
  const [command = "unknown", ...rest] = argv;
  const observation = blank(COMMANDS.has(command) ? command : "unknown");
  if (argv.some((arg) => PAYMENT_FLAGS.has(arg))) return fail(observation, "payment_refused");
  if (!nodeSupported()) return fail(observation, "runtime_refused");
  if (!COMMANDS.has(command)) return fail(observation, "invalid_command");
  let pins;
  try { pins = loadPins(); }
  catch (error) { return fail(observation, safeCode(error?.code, "pins_refused")); }
  if (!pins) return fail(observation, "pins_refused");
  const parsed = flagsOf(rest);
  if (parsed.error) return fail(observation, parsed.error);
  const timeout = timeoutOf(parsed.flags);
  if (timeout?.error) return fail(observation, timeout.error);
  if (command === "acquire") return commandAcquire(observation, parsed.flags, timeout);
  if (command === "describe") return commandDescribe(observation, parsed.flags, timeout);
  if (command === "map") return commandMap(observation, parsed.flags, timeout);
  if (command === "submit") return commandSubmit(observation, parsed.flags, timeout);
  return commandRead(observation, parsed.flags, timeout);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    const observation = blank("unknown");
    fail(observation, "request_failed");
  });
}
