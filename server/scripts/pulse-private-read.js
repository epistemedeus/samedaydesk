// Credential-explicit private reader for GET /api/pulse.
// The caller names one token source. This module does not read source files
// for a credential, does not select an env var on its own, and has no fallback.
import crypto from "node:crypto";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const READER_EXIT = Object.freeze({
  ok: 0,
  missingCredential: 2,
  authRefused: 3,
  boundedFailure: 4,
});

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 1048576;
const MAX_TIMEOUT_MS = 10000;
const MAX_TOKEN_FILE_BYTES = 4096;

const FLAGS = new Map([
  ["--origin", "origin"],
  ["--env-var", "envVar"],
  ["--token-file", "tokenFile"],
  ["--raw-file", "rawFile"],
  ["--timeout-ms", "timeoutMs"],
  ["--max-bytes", "maxBytes"],
]);

function failure(exitCode, error, extra = {}) {
  return { exitCode, body: { error, ...extra } };
}

export function parseReaderArgs(argv) {
  const args = {
    origin: null,
    envVar: null,
    tokenFile: null,
    rawFile: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxBytes: DEFAULT_MAX_BYTES,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const name = FLAGS.get(argv[i]);
    if (!name) return { error: "usage" };
    i += 1;
    const value = argv[i];
    if (value === undefined || value.startsWith("--")) return { error: "usage" };
    if (name === "timeoutMs" || name === "maxBytes") {
      if (!/^[1-9]\d*$/.test(value)) return { error: "usage" };
      args[name] = Number(value);
    } else {
      args[name] = value;
    }
  }
  if (!Number.isSafeInteger(args.timeoutMs) || args.timeoutMs > MAX_TIMEOUT_MS) return { error: "bound" };
  if (!Number.isSafeInteger(args.maxBytes) || args.maxBytes > DEFAULT_MAX_BYTES) return { error: "bound" };
  return { args };
}

function bareOrigin(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  return url.origin;
}

function explicitToken(text) {
  if (typeof text !== "string") return null;
  const token = text.trim();
  if (token.length === 0) return null;
  if (/[\u0000-\u001f\u007f]/.test(token)) return null;
  return token;
}

function readTokenFile(file) {
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_TOKEN_FILE_BYTES) return null;
    return explicitToken(fs.readFileSync(fd, "utf8"));
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function loadExplicitCredential({ envVar, tokenFile, env }) {
  const hasEnv = typeof envVar === "string";
  const hasFile = typeof tokenFile === "string";
  if (hasEnv === hasFile) {
    return hasEnv
      ? failure(READER_EXIT.boundedFailure, "bounded_failure", { reason: "credential_source_conflict" })
      : failure(READER_EXIT.missingCredential, "missing_credential");
  }
  if (hasEnv) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envVar)) {
      return failure(READER_EXIT.missingCredential, "missing_credential");
    }
    if (!Object.hasOwn(env, envVar)) return failure(READER_EXIT.missingCredential, "missing_credential");
    const token = explicitToken(env[envVar]);
    if (token === null) return failure(READER_EXIT.missingCredential, "missing_credential");
    return { token };
  }
  const token = readTokenFile(tokenFile);
  if (token === null) return failure(READER_EXIT.missingCredential, "missing_credential");
  return { token };
}

function numeric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numericMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (!/^[A-Za-z0-9_|.-]{1,120}$/.test(key)) continue;
    if (typeof item !== "number" || !Number.isFinite(item)) continue;
    out[key] = item;
  }
  return out;
}

function timeValue(value) {
  if (typeof value !== "string") return null;
  // Durable Postgres timestamps use offsets and up to six fractional digits.
  // Preserve the validated wire value; JS Date would round away precision.
  const shape = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  const match = shape.exec(value);
  if (!match || match[0] !== value || !Number.isFinite(Date.parse(value))) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ? value : null;
}

const safeCount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const safeBoolean = value => typeof value === "boolean" ? value : null;
const allowed = (value, list) => list.includes(value) ? value : null;
const FREE_TOOL_OUTCOMES = ["completed", "invalid_host", "unreachable", "timeout", "abandoned", "other_failure"];


// The producer admits these fixed classes, not arbitrary request methods or URLs.
// The metadata regression checks parity with pulse-store/schema.js.
const MCP_METHOD_CLASSES = new Set(["initialize", "tools/list", "tools/call", "notifications", "other"]);
function mcpMethodCounts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).filter(([key, count]) =>
    MCP_METHOD_CLASSES.has(key) && Number.isSafeInteger(count) && count >= 0));
}

function reportCoverage(parsed) {
  const freeTool = parsed.freeTool;
  return {
    complete: safeBoolean(parsed.complete),
    authority: allowed(parsed.authority, ["durable_atomic_aggregate", "incomplete_local_fallback", "incomplete_known_gap"]),
    pendingRequests: safeCount(parsed.pending?.total),
    freeTool: {
      route: "/api/tools/ai-readiness",
      complete: safeBoolean(freeTool?.complete),
      coverage: allowed(freeTool?.coverage, ["lower_bound_from_first_observation", "unknown"]),
      observedFrom: timeValue(freeTool?.observedFrom),
      // One completed response is not independent use or a conversion rate.
      outcomes: Object.fromEntries(FREE_TOOL_OUTCOMES.map(key => [key, safeCount(freeTool?.outcomes?.[key])])),
    },
  };
}

export function safePulseMetadata(status, bytes) {
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return {
    status,
    window: {
      startedAt: timeValue(parsed.startedAt),
      now: timeValue(parsed.now),
    },
    coverage: reportCoverage(parsed),
    counts: {
      total: numeric(parsed.total),
      humans: numeric(parsed.humans),
      bots: numeric(parsed.bots),
      aiCrawlers: numeric(parsed.aiCrawlers),
      uniqueHumansEstimate: numeric(parsed.uniqueHumansEstimate?.count),
      mcpSurfaceGet: numeric(parsed.mcpSurfaceGet?.requests),
      mcpProtocolRequests: numeric(parsed.mcpProtocol?.httpRequests),
      mcpProtocolMessages: numeric(parsed.mcpProtocol?.messages),
      mcpByMethod: mcpMethodCounts(parsed.mcpProtocol?.byMethod),
      sellerRepairBriefViews: numeric(parsed.sellerRepair?.briefViews),
      sellerRepairScopeClicks: numeric(parsed.sellerRepair?.scopeClicks),
      sellerRepairCheckoutStarts: numeric(parsed.sellerRepair?.checkoutStarts),
      funnel: numericMap(parsed.funnel),
      freeToolRequests: numeric(parsed.freeTool?.requests),
    },
    digest: { algorithm: "sha256", hex: digest },
  };
}

async function readBounded(response, maxBytes) {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    await response.body?.cancel().catch(() => {});
    return { tooLarge: true };
  }
  if (!response.body) return { bytes: Buffer.alloc(0) };
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      total += step.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { tooLarge: true };
      }
      chunks.push(Buffer.from(step.value));
    }
  } catch {
    return { failed: true };
  }
  return { bytes: Buffer.concat(chunks) };
}

function writePrivateFile(file, bytes) {
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW;
  const fd = fs.openSync(file, flags, 0o600);
  try {
    fs.fchmodSync(fd, 0o600);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export async function readPulse({ origin, token, timeoutMs, maxBytes, rawFile }) {
  const base = bareOrigin(origin);
  if (base === null) return failure(READER_EXIT.boundedFailure, "bounded_failure", { reason: "bad_origin" });
  const target = new URL("/api/pulse", base);
  target.searchParams.set("k", token);
  if (target.origin !== base) return failure(READER_EXIT.boundedFailure, "bounded_failure", { reason: "bad_origin" });

  let response;
  try {
    response = await fetch(target, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    });
  } catch (error) {
    const reason = error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "origin_unreachable";
    return failure(READER_EXIT.boundedFailure, "bounded_failure", { reason });
  }

  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    await response.body?.cancel().catch(() => {});
    return failure(READER_EXIT.boundedFailure, "bounded_failure", { reason: "redirect_refused", status: response.status });
  }

  const body = await readBounded(response, maxBytes);
  if (body.tooLarge) {
    return failure(READER_EXIT.boundedFailure, "bounded_failure", { reason: "response_too_large", status: response.status });
  }
  if (body.failed) return failure(READER_EXIT.boundedFailure, "bounded_failure", { reason: "bad_response", status: response.status });

  if (response.status === 404 || response.status === 503) {
    return failure(READER_EXIT.authRefused, "auth_refused", { status: response.status });
  }
  if (response.status !== 200) {
    return failure(READER_EXIT.boundedFailure, "bounded_failure", { reason: "bad_status", status: response.status });
  }

  const metadata = safePulseMetadata(response.status, body.bytes);
  if (metadata === null) {
    return failure(READER_EXIT.boundedFailure, "bounded_failure", { reason: "bad_response", status: response.status });
  }
  if (typeof rawFile === "string") {
    try {
      writePrivateFile(rawFile, body.bytes);
    } catch {
      return failure(READER_EXIT.boundedFailure, "bounded_failure", { reason: "raw_file_refused", status: response.status });
    }
  }
  return { exitCode: READER_EXIT.ok, body: metadata };
}

export async function executeReader(argv, env = process.env) {
  const parsed = parseReaderArgs(argv);
  if (parsed.error) {
    const reason = parsed.error === "bound" ? "bound_refused" : "usage";
    return failure(READER_EXIT.boundedFailure, "bounded_failure", { reason });
  }
  const credential = loadExplicitCredential({
    envVar: parsed.args.envVar,
    tokenFile: parsed.args.tokenFile,
    env,
  });
  if (credential.exitCode) return credential;
  return readPulse({
    origin: parsed.args.origin,
    token: credential.token,
    timeoutMs: parsed.args.timeoutMs,
    maxBytes: parsed.args.maxBytes,
    rawFile: parsed.args.rawFile,
  });
}

export async function main(argv, options = {}) {
  const stdout = options.stdout || process.stdout;
  const result = await executeReader(argv, options.env || process.env);
  stdout.write(`${JSON.stringify(result.body)}\n`);
  return result.exitCode;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const code = await main(process.argv.slice(2));
  process.exit(code);
}
