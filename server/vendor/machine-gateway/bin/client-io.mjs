import { constants, closeSync, fstatSync, openSync, readFileSync, writeFileSync, fsyncSync, renameSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
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
// Recovery classes for one request. They describe what the client observed,
// not a promise: a lost response after dispatch never proves that no effect
// happened, and nothing here survives loss of the caller's own storage.
//   not_sent          no byte left this process (aborted before dispatch,
//                     recovery record not saved, or connection refused)
//   sent_unconfirmed  dispatch began and no server outcome was received
//   remote_refused    the server answered with an error; that answer is final
//                     for this attempt
//   remote_committed  the server answered 2xx; the body may still have been
//                     lost, in which case read back by the operation identity
//   remote_cancelled  the server itself reported the work as aborted
export const RECOVERY = Object.freeze(["not_sent", "sent_unconfirmed", "remote_refused", "remote_committed", "remote_cancelled"]);
const SERVER_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const REMOTE_CANCEL_CODES = new Set(["execution_aborted", "request_aborted"]);
const NOT_SENT_CAUSES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ERR_INVALID_URL"]);

// The error keeps the legacy message (gateway_http_<status>,
// gateway_response_too_large) so existing callers that print error.message keep
// their output. code carries the server code when the server sent one, including
// codes this client does not know yet. diagnostics hold no credential, no
// request body and no response text.
export class GatewayRequestError extends Error {
  constructor(message, { code = message, status = null, serverCode = null, recovery, operation, diagnostics = {} } = {}) {
    super(message);
    this.name = "GatewayRequestError";
    this.code = code;
    this.status = status;
    this.serverCode = serverCode;
    this.recovery = recovery;
    this.operation = operation;
    this.diagnostics = diagnostics;
  }
  toJSON() {
    return { code: this.code, message: this.message, status: this.status, serverCode: this.serverCode, recovery: this.recovery,
      operation: { method: this.operation.method, path: this.operation.path, idempotencyKeySha256: this.operation.idempotencyKeySha256 },
      diagnostics: this.diagnostics };
  }
}

function serverCodeOf(value) {
  const candidate = value?.error?.code ?? (value?.ok === false ? value.code : undefined);
  return typeof candidate === "string" && SERVER_CODE.test(candidate) ? candidate : null;
}

// Receipts are the gateway's own outcome record. A failed receipt whose error is
// execution_aborted is a confirmed remote cancellation; other terminal or
// running receipts mean the server holds the operation.
export function receiptRecovery(receipt) {
  if (receipt?.status === "failed" && REMOTE_CANCEL_CODES.has(receipt?.error?.code)) return "remote_cancelled";
  return "remote_committed";
}

async function readBounded(response, limit, signal) {
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) { await reader.cancel().catch(() => {}); return { tooLarge: true, size }; }
      chunks.push(Buffer.from(next.value));
    }
  } finally { try { reader.releaseLock(); } catch {} }
  if (signal?.aborted) throw signal.reason;
  return { bytes: Buffer.concat(chunks), size };
}

// request(base, path, options)
//   token, body, key        unchanged; POST iff body
//   signal                  caller AbortSignal (SIGINT, deadline, consumer gone)
//   timeoutMs               default 15000, as before
//   beforeDispatch(record)  awaited before a POST is sent; persist the record
//                           there. If it throws, nothing is sent (not_sent).
// A POST is never retried here. Recovery is the caller's choice from the class.
export async function request(base, path, { token, body, key, signal, timeoutMs = 15000, maxBytes = 524288, beforeDispatch } = {}) {
  const method = body ? "POST" : "GET";
  const operation = Object.freeze({ method, path, idempotencyKey: key ?? null,
    idempotencyKeySha256: key ? createHash("sha256").update(key).digest("hex") : null });
  const fail = (message, fields) => new GatewayRequestError(message, { operation, ...fields });
  const localAbort = reason => reason?.name === "TimeoutError" ? "request_timeout" : "request_aborted";
  if (signal?.aborted) throw fail(localAbort(signal.reason), { recovery: "not_sent", diagnostics: { phase: "before_dispatch" } });
  if (body && beforeDispatch) {
    try { await beforeDispatch({ schema: "neomorphic.machine-gateway.dispatch-record.v1", method, path, idempotencyKeySha256: operation.idempotencyKeySha256, recovery: "sent_unconfirmed" }); }
    catch { throw fail("recovery_record_unsaved", { recovery: "not_sent", diagnostics: { phase: "before_dispatch" } }); }
    if (signal?.aborted) throw fail(localAbort(signal.reason), { recovery: "not_sent", diagnostics: { phase: "before_dispatch" } });
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method, redirect: "manual", signal: combined,
      headers: { accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { "content-type": "application/json" } : {}), ...(key ? { "idempotency-key": key } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (combined.aborted) throw fail(localAbort(combined.reason), { recovery: "sent_unconfirmed", diagnostics: { phase: "dispatch" } });
    const cause = error?.cause?.code;
    throw fail("transport_failed", { recovery: NOT_SENT_CAUSES.has(cause) ? "not_sent" : "sent_unconfirmed",
      diagnostics: { phase: "dispatch", cause: typeof cause === "string" && /^[A-Z_]{1,40}$/.test(cause) ? cause : null } });
  }
  const status = response.status;
  const contentType = response.headers.get("content-type") || "";
  const json = contentType.includes("application/json");
  const committed = response.ok ? "remote_committed" : "remote_refused";
  let read;
  try { read = await readBounded(response, maxBytes, combined); }
  catch {
    // The status line arrived. A 2xx POST means the server holds the operation even
    // though its body (with any server ID) was lost: read back, do not resend blindly.
    throw fail(combined.aborted ? localAbort(combined.reason) : "response_interrupted",
      { status, recovery: response.ok ? committed : "sent_unconfirmed", diagnostics: { phase: "response", contentType: contentType.slice(0, 80) } });
  }
  const diagnostics = { phase: "response", contentType: contentType.slice(0, 80), bytes: read.size };
  if (read.tooLarge) throw fail("gateway_response_too_large", { status, recovery: response.ok ? committed : "sent_unconfirmed", diagnostics });
  diagnostics.bodySha256 = createHash("sha256").update(read.bytes).digest("hex");
  let value;
  if (json) { try { value = JSON.parse(read.bytes.toString("utf8")); } catch { value = undefined; } }
  if (!response.ok || !json) {
    const serverCode = json ? serverCodeOf(value) : null;
    const recovery = REMOTE_CANCEL_CODES.has(serverCode) ? "remote_cancelled"
      : status >= 500 || !json ? "sent_unconfirmed" : committed;
    throw fail(`gateway_http_${status}`, { code: serverCode ?? `gateway_http_${status}`, status, serverCode, recovery, diagnostics });
  }
  if (value === undefined) throw fail("gateway_response_invalid", { status, recovery: committed, diagnostics });
  return value;
}
