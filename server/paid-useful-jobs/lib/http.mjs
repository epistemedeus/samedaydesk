/**
 * Process-local HTTP adapter over execution.v1. Request-bound replay is bounded
 * and expires closed. Durable restart recovery belongs to order/mailbox stores.
 */
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { EXECUTION_CONTRACT_VERSION } from "./contract.mjs";
import { freezeRequest } from "./input-guard.mjs";
import { runPaidOffer } from "./wrapper.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
function failure(code, message, status = 400) { return Object.assign(new Error(message), { code, status }); }
function canonical(value) {
  if (Buffer.isBuffer(value)) return { bytes: value.length, sha256: createHash("sha256").update(value).digest("hex") };
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => [k, canonical(value[k])]));
  return value;
}
function directoryIdentity(root) {
  let total = 0, count = 0;
  const walk = (dir) => readdirSync(dir).sort().map((name) => {
    const path = join(dir, name), st = lstatSync(path);
    if (++count > 4096 || st.isSymbolicLink() || (!st.isFile() && !st.isDirectory())) throw failure("input-root-not-supported", "HTTP directory identity requires bounded regular files without symlinks");
    if (st.isDirectory()) return [name, walk(path)];
    total += st.size;
    if (total > MAX_BODY_BYTES) throw failure("input-oversize", "HTTP directory snapshot exceeds 8 MiB", 413);
    return [name, canonical(readFileSync(path))];
  });
  return walk(root);
}
function frozenIdentity(request) {
  const frozen = freezeRequest(request);
  const identities = {};
  if (typeof frozen.inputs["input-root"] === "string") identities["input-root"] = directoryIdentity(frozen.inputs["input-root"]);
  const { executionId, ...bound } = frozen;
  return { frozen, hash: createHash("sha256").update(JSON.stringify(canonical({ ...bound, directoryIdentities: identities }))).digest("hex") };
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let bytes = 0, failed = false;
    req.on("data", (chunk) => {
      if (failed) return;
      bytes += chunk.length;
      if (bytes > limit) { failed = true; reject(failure("input-body-too-large", "Execution request body exceeds limit", 413)); return; }
      chunks.push(chunk);
    });
    req.on("end", () => { if (!failed) resolve(Buffer.concat(chunks).toString("utf8")); });
    req.on("error", reject);
    req.on("aborted", () => reject(failure("request-aborted", "Request body interrupted")));
  });
}
export function createExecutionServer({
  execute = runPaidOffer, resultTtlMs = 24 * 60 * 60 * 1000,
  maxEntries = 1024, maxBodyBytes = MAX_BODY_BYTES,
} = {}) {
  for (const value of [resultTtlMs, maxEntries, maxBodyBytes]) if (!Number.isSafeInteger(value) || value < 1) throw new Error("HTTP limits must be positive integers");
  const store = new Map();
  function expired(row) {
    if (row.state === "pending") return false;
    if (row.state === "expired" || Date.now() >= row.expiresAt) {
      row.state = "expired"; row.body = null; row.pending = null; return true;
    }
    return false;
  }
  const server = createServer((req, res) => {
    const end = (status, body) => {
      if (res.destroyed || res.writableEnded) return;
      const text = JSON.stringify(body);
      res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
      res.end(text);
    };
    const error = (status, code, message) => end(status, { ok: false, code, error: message, contract: EXECUTION_CONTRACT_VERSION });
    const reply = async (id, row) => {
      if (expired(row)) return error(410, "execution-expired", "Result expired; this execution ID cannot be run again in this process");
      if (row.pending) await row.pending;
      if (expired(row)) return error(410, "execution-expired", "Result expired; this execution ID cannot be run again in this process");
      end(row.httpStatus, { ...row.body, retrieval: { id, path: "/results/" + encodeURIComponent(id) }, cache: { scope: "process-local", expiresAt: row.expiresAt } });
    };
    (async () => {
      const url = req.url || "/";
      if (req.method === "GET" && url === "/health") return end(200, { ok: true, contract: EXECUTION_CONTRACT_VERSION });
      if (req.method === "GET" && url.startsWith("/results/")) {
        let id;
        try { id = decodeURIComponent(url.slice("/results/".length).split("?")[0]); }
        catch { throw failure("invalid-execution-id", "Malformed result URL"); }
        if (!ID.test(id)) throw failure("invalid-execution-id", "Invalid execution ID");
        const row = store.get(id);
        if (!row) return error(404, "not-found", "Execution not found in this process");
        return reply(id, row);
      }
      if (req.method === "POST" && (url === "/execute" || url === "/execute/")) {
        const raw = await readBody(req, maxBodyBytes);
        let request;
        try { request = JSON.parse(raw || "{}"); } catch (err) { throw failure("invalid-json", err.message); }
        if (!request || typeof request !== "object" || Array.isArray(request)) throw failure("invalid-request", "Execution request must be an object");
        const id = request.executionId === undefined ? randomUUID() : request.executionId;
        if (typeof id !== "string" || !ID.test(id)) throw failure("invalid-execution-id", "Execution ID must be 1-128 safe characters");
        request.executionId = id;
        const { frozen, hash } = frozenIdentity(request);
        const existing = store.get(id);
        if (existing) {
          if (existing.requestHash !== hash) return error(409, "execution-id-conflict", "Execution ID is bound to different request bytes");
          return reply(id, existing);
        }
        if (store.size >= maxEntries) return error(503, "execution-cache-full", "Process-local execution cache is full; no execution started");
        const row = { requestHash: hash, state: "pending", pending: null, body: null, expiresAt: null, httpStatus: 200 };
        store.set(id, row);
        row.pending = Promise.resolve().then(() => execute(frozen)).then((result) => {
          if (!result || typeof result !== "object" || Array.isArray(result) || (result.executionId && result.executionId !== id)) throw new Error("Execution result identity mismatch");
          row.body = { ...result, executionId: id };
        }).catch((err) => {
          row.httpStatus = 500;
          row.body = { ok: false, code: "internal-error", transport: "internal-error", outcome: "unknown", error: err.message, executionId: id, contract: EXECUTION_CONTRACT_VERSION };
        }).finally(() => { row.state = "complete"; row.expiresAt = Date.now() + resultTtlMs; row.pending = null; });
        return reply(id, row);
      }
      return error(404, "not-found", "Route not found");
    })().catch((err) => error(err.status || 500, err.code || "internal-error", err.message));
  });
  server.requestTimeout = 30_000;
  return { server, store };
}
export function listenExecutionServer(server, { host = "127.0.0.1", port = 0 } = {}) {
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({ host, port: addr.port, origin: "http://" + host + ":" + addr.port });
    });
  });
}
