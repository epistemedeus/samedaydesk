// Controller for the hosted discovery-log export.
// assertEnrolledAuthFile is a local precondition (mode 0600, at least 32 bytes).
// The server authenticates CORRESPONDENCE_ADMIN_TOKEN. The journey HMAC is not used.
//
// Root-run, after the private auth file is on this machine and the route is deployed:
//   node tools/discovery-log-export/cli.mjs export \
//     --origin https://samedaydesk.com \
//     --date YYYY-MM-DD \
//     --auth-file /workspace/pilot/private/credentials/correspondence/CORRESPONDENCE_ADMIN_TOKEN
//   node tools/discovery-log-export/cli.mjs export \
//     --origin https://samedaydesk.com \
//     --date YYYY-MM-DD \
//     --auth-file /workspace/pilot/private/credentials/correspondence/CORRESPONDENCE_ADMIN_TOKEN \
//     --cursor <continuation>
//   node tools/discovery-log-export/cli.mjs retain \
//     --origin https://samedaydesk.com \
//     --auth-file /workspace/pilot/private/credentials/correspondence/CORRESPONDENCE_ADMIN_TOKEN \
//     --receipt-file /private/export-receipts.json \
//     --received --as-of YYYY-MM-DD
// Retain deletes nothing unless each receipt is a completed export for that exact day.
// A 64-page stop writes the partial NDJSON and a continuation cursor. It does not throw.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertEnrolledAuthFile } from "../../server/lib/discovery-log/bounds.mjs";
import { assertExportReceipts } from "../../server/lib/discovery-log/retain.mjs";

export const MAX_PAGES = 64;
const MAX_RESPONSE = 1048576 * 2 + 65536;
const REQUEST_MS = 10000;
const BODY_MS = 10000;
const OVERALL_MS = 120000;

function flags(argv) {
  const out = { _: [] };
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) {
      out._.push(key);
      continue;
    }
    if (key === "--received") {
      if (Object.hasOwn(out, key)) throw new Error("discovery_export_unauthenticated");
      out[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!/^--[a-z-]{1,32}$/.test(key || "") || value === undefined || value.startsWith("--") || Object.hasOwn(out, key)) {
      throw new Error("discovery_export_unauthenticated");
    }
    out[key] = value;
    index += 1;
  }
  return out;
}

function originOf(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("discovery_export_refused"); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("discovery_export_refused");
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && loopback) return url.origin;
  throw new Error("discovery_export_refused");
}

export function loadPrivateBearer(file) {
  assertEnrolledAuthFile(file);
  const body = fs.readFileSync(file);
  let token = body.toString("utf8");
  body.fill(0);
  if (token.endsWith("\n")) token = token.slice(0, -1);
  if (token.endsWith("\r")) token = token.slice(0, -1);
  if (token.length < 32 || token.length > 256 || token.includes("\n") || token.includes("\0")) {
    throw new Error("discovery_export_unauthenticated");
  }
  return token;
}

function deadlineError(progress) {
  const error = new Error("discovery_export_deadline");
  error.progress = progress;
  return error;
}

function openDeadline(ms, parent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const onParent = () => controller.abort();
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener("abort", onParent, { once: true });
  }
  return {
    signal: controller.signal,
    close() {
      clearTimeout(timer);
      if (parent) parent.removeEventListener("abort", onParent);
    },
  };
}

export async function readBounded(response, { limit = MAX_RESPONSE, signal } = {}) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    if (signal?.aborted) throw deadlineError("");
    const text = await response.text();
    if (signal?.aborted) throw deadlineError(text);
    if (Buffer.byteLength(text) > limit) throw new Error("discovery_export_unbounded");
    return text;
  }
  const parts = [];
  let size = 0;
  const progress = () => Buffer.concat(parts).toString("utf8");
  let settleAbort = null;
  const onAbort = () => settleAbort?.reject(deadlineError(progress()));
  const abortPromise = signal ? new Promise((resolve, reject) => { settleAbort = { resolve, reject }; }) : null;
  abortPromise?.catch(() => {});
  if (signal) {
    signal.addEventListener("abort", onAbort);
    if (signal.aborted) onAbort();
  }
  try {
    if (signal?.aborted) throw deadlineError(progress());
    for (;;) {
      let step;
      try {
        step = abortPromise ? await Promise.race([reader.read(), abortPromise]) : await reader.read();
      } catch (error) {
        try { await reader.cancel(); } catch { /* the caller still receives progress */ }
        if (error?.message === "discovery_export_deadline") throw deadlineError(progress());
        throw error;
      }
      if (signal?.aborted) {
        try { await reader.cancel(); } catch { /* released below */ }
        throw deadlineError(progress());
      }
      if (step.done) break;
      size += step.value.byteLength;
      if (size > limit) {
        try { await reader.cancel(); } catch { /* released below */ }
        throw new Error("discovery_export_unbounded");
      }
      parts.push(Buffer.from(step.value));
    }
  } finally {
    if (signal) signal.removeEventListener("abort", onAbort);
    settleAbort?.resolve();
    try { reader.releaseLock(); } catch { /* already released */ }
  }
  return Buffer.concat(parts).toString("utf8");
}

function errorCode(text) {
  try {
    const body = JSON.parse(text);
    if (typeof body?.error === "string" && /^discovery_[a-z0-9_]+$/.test(body.error)) return body.error;
  } catch { /* not our error */ }
  return "";
}

async function authed(origin, token, pathName, init, fetchFn, signal) {
  const response = await fetchFn(new URL(pathName, origin), {
    ...init,
    redirect: "error",
    signal,
    headers: {
      ...(init.headers || {}),
      authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  });
  const text = await readBounded(response, { signal });
  if (!response.ok) throw new Error(errorCode(text) || `discovery_export_http_${response.status}`);
  return text;
}

function receiptFrom(body) {
  if (body.complete !== true) return null;
  const receipt = {
    schema: "samedaydesk.discovery-log.export-receipt.v1",
    date: body.date,
    complete: true,
    watermark: body.watermark,
    bytes: body.bytes,
  };
  assertExportReceipts([receipt]);
  return receipt;
}

export function formatExportResult(result) {
  const stdout = result.lines.length ? `${result.lines.join("\n")}\n` : "";
  let stderr = "";
  if (result.timedOut) stderr = `discovery_export_deadline\n${stderr}`;
  if (!result.complete && result.continuation) stderr += `discovery_export_continuation ${result.continuation}\n`;
  else if (result.receipt) stderr += `receipt ${JSON.stringify(result.receipt)}\n`;
  return { stdout, stderr, status: 0 };
}

export async function exportHostedLog({ origin, date, authFile, fetch: fetchImpl, cursor = "", maxPages = MAX_PAGES, deadlines = {} }) {
  const token = loadPrivateBearer(authFile);
  const base = originOf(origin);
  if (typeof date !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) throw new Error("discovery_export_unbounded");
  const fetchFn = fetchImpl || globalThis.fetch;
  const requestMs = deadlines.requestMs ?? REQUEST_MS;
  const bodyMs = deadlines.bodyMs ?? BODY_MS;
  const overallMs = deadlines.overallMs ?? OVERALL_MS;
  const overall = openDeadline(overallMs);
  const lines = [];
  let current = cursor || "";
  try {
    for (let page = 0; page < maxPages; page += 1) {
      if (overall.signal.aborted) return { lines, complete: false, continuation: current || null, receipt: null, timedOut: true };
      const query = current ? `?date=${date}&cursor=${encodeURIComponent(current)}` : `?date=${date}`;
      const request = openDeadline(requestMs, overall.signal);
      const bodyDeadline = openDeadline(bodyMs, overall.signal);
      let text;
      try {
        const response = await fetchFn(new URL(`/api/discovery-log/v1/export${query}`, base), {
          method: "GET",
          redirect: "error",
          signal: request.signal,
          headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        });
        text = await readBounded(response, { signal: bodyDeadline.signal });
        if (!response.ok) throw new Error(errorCode(text) || `discovery_export_http_${response.status}`);
      } catch (error) {
        if (error?.message === "discovery_export_deadline" || request.signal.aborted || bodyDeadline.signal.aborted || overall.signal.aborted) {
          return { lines, complete: false, continuation: current || null, receipt: null, timedOut: true, progress: error?.progress || "" };
        }
        throw error;
      } finally {
        request.close();
        bodyDeadline.close();
      }
      if (text.includes(token)) throw new Error("discovery_export_token_refused");
      let body;
      try { body = JSON.parse(text); } catch { throw new Error("discovery_export_refused"); }
      if (body.schema !== "samedaydesk.discovery-log.export.v1" || body.date !== date || !Array.isArray(body.lines)) {
        throw new Error("discovery_export_refused");
      }
      for (const line of body.lines) {
        if (typeof line !== "string" || line.includes(token) || line.includes("x-samedaydesk-journey")) {
          throw new Error("discovery_export_token_refused");
        }
        lines.push(line);
      }
      if (body.complete === true && body.nextCursor == null) {
        return { lines, complete: true, continuation: null, receipt: receiptFrom(body), timedOut: false };
      }
      if (typeof body.nextCursor !== "string" || body.nextCursor.length === 0 || body.nextCursor === current) {
        throw new Error("discovery_export_cursor_refused");
      }
      current = body.nextCursor;
    }
    return { lines, complete: false, continuation: current, receipt: null, timedOut: false };
  } catch (error) {
    if (error?.message === "discovery_export_deadline") {
      return { lines, complete: false, continuation: current || null, receipt: null, timedOut: true, progress: error.progress || "" };
    }
    throw error;
  } finally {
    overall.close();
  }
}

export async function retainHostedLog({ origin, authFile, asOf, receipts, fetch: fetchImpl, deadlines = {} }) {
  const token = loadPrivateBearer(authFile);
  const checked = assertExportReceipts(receipts);
  const base = originOf(origin);
  const fetchFn = fetchImpl || globalThis.fetch;
  const overall = openDeadline(deadlines.overallMs ?? OVERALL_MS);
  const request = openDeadline(deadlines.requestMs ?? REQUEST_MS, overall.signal);
  try {
    const text = await authed(base, token, "/api/discovery-log/v1/retain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ retainDays: 30, received: true, receipts: checked, ...(asOf ? { asOf } : {}) }),
    }, fetchFn, request.signal);
    if (text.includes(token)) throw new Error("discovery_export_token_refused");
    const body = JSON.parse(text);
    if (body.schema !== "samedaydesk.discovery-log.retain.v1" || body.retainDays !== 30 || body.ok !== true) {
      throw new Error("discovery_export_refused");
    }
    return body;
  } finally {
    request.close();
    overall.close();
  }
}

function refuse(error) {
  const code = /^discovery_[a-z0-9_]+$/.test(error?.message || "") ? error.message : "discovery_export_refused";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = flags(process.argv);
    if (args._.length > 1) throw new Error("discovery_export_unauthenticated");
    const command = args._[0] || "export";
    if (command === "export") {
      const known = ["--origin", "--date", "--auth-file"];
      if (args["--cursor"]) known.push("--cursor");
      if (known.filter(key => key !== "--cursor").some(key => !Object.hasOwn(args, key)) || Object.keys(args).some(key => key !== "_" && !known.includes(key))) {
        throw new Error("discovery_export_unauthenticated");
      }
      const result = await exportHostedLog({
        origin: args["--origin"], date: args["--date"], authFile: args["--auth-file"], cursor: args["--cursor"] || "",
      });
      const presented = formatExportResult(result);
      process.stdout.write(presented.stdout);
      if (presented.stderr) process.stderr.write(presented.stderr);
    } else if (command === "retain") {
      if (!args["--received"]) throw new Error("discovery_retain_not_received");
      const known = ["--origin", "--auth-file", "--received", "--receipt-file"];
      if (args["--as-of"]) known.push("--as-of");
      if (known.filter(key => key !== "--as-of").some(key => !Object.hasOwn(args, key)) || Object.keys(args).some(key => key !== "_" && !known.includes(key))) {
        throw new Error("discovery_export_unauthenticated");
      }
      let receipts;
      try { receipts = JSON.parse(fs.readFileSync(args["--receipt-file"], "utf8")); } catch { throw new Error("discovery_retain_receipt_required"); }
      const receipt = await retainHostedLog({
        origin: args["--origin"], authFile: args["--auth-file"], asOf: args["--as-of"], receipts,
      });
      process.stdout.write(`${JSON.stringify(receipt)}\n`);
    } else {
      throw new Error("discovery_export_unauthenticated");
    }
  } catch (error) {
    refuse(error);
  }
}
