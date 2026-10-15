// Controller for the hosted discovery-log export.
// assertEnrolledAuthFile is a local precondition (mode 0600, at least 32 bytes).
// The server authenticates CORRESPONDENCE_ADMIN_TOKEN. The journey HMAC is not used.
//
// Root-run, after the private auth file is on this machine and the route is deployed:
//   node tools/discovery-log-export/cli.mjs export \
//     --origin https://samedaydesk.com \
//     --date YYYY-MM-DD \
//     --auth-file /workspace/pilot/private/credentials/correspondence/CORRESPONDENCE_ADMIN_TOKEN
//   node tools/discovery-log-export/cli.mjs retain \
//     --origin https://samedaydesk.com \
//     --auth-file /workspace/pilot/private/credentials/correspondence/CORRESPONDENCE_ADMIN_TOKEN \
//     --received --as-of YYYY-MM-DD
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertEnrolledAuthFile } from "../../server/lib/discovery-log/bounds.mjs";

const MAX_PAGES = 64;
const MAX_RESPONSE = 1048576 * 2 + 65536;

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

async function readBounded(response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE) throw new Error("discovery_export_unbounded");
    return text;
  }
  const parts = [];
  let size = 0;
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    size += step.value.byteLength;
    if (size > MAX_RESPONSE) throw new Error("discovery_export_unbounded");
    parts.push(step.value);
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

async function authed(origin, token, pathName, init) {
  const response = await fetch(new URL(pathName, origin), {
    ...init,
    redirect: "error",
    headers: {
      ...(init.headers || {}),
      authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  });
  const text = await readBounded(response);
  if (!response.ok) throw new Error(errorCode(text) || `discovery_export_http_${response.status}`);
  return text;
}

export async function exportHostedLog({ origin, date, authFile, fetchImpl }) {
  const token = loadPrivateBearer(authFile);
  const base = originOf(origin);
  if (typeof date !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) throw new Error("discovery_export_unbounded");
  const saved = globalThis.fetch;
  if (fetchImpl) globalThis.fetch = fetchImpl;
  const lines = [];
  try {
    let cursor = "";
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = cursor ? `?date=${date}&cursor=${encodeURIComponent(cursor)}` : `?date=${date}`;
      const text = await authed(base, token, `/api/discovery-log/v1/export${query}`, { method: "GET" });
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
      if (body.complete === true && body.nextCursor == null) return lines;
      if (typeof body.nextCursor !== "string" || body.nextCursor.length === 0 || body.nextCursor === cursor) {
        throw new Error("discovery_export_cursor_refused");
      }
      cursor = body.nextCursor;
    }
    throw new Error("discovery_export_unbounded");
  } finally {
    if (fetchImpl) globalThis.fetch = saved;
  }
}

export async function retainHostedLog({ origin, authFile, asOf, fetchImpl }) {
  const token = loadPrivateBearer(authFile);
  const base = originOf(origin);
  const saved = globalThis.fetch;
  if (fetchImpl) globalThis.fetch = fetchImpl;
  try {
    const text = await authed(base, token, "/api/discovery-log/v1/retain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ retainDays: 30, received: true, ...(asOf ? { asOf } : {}) }),
    });
    if (text.includes(token)) throw new Error("discovery_export_token_refused");
    const body = JSON.parse(text);
    if (body.schema !== "samedaydesk.discovery-log.retain.v1" || body.retainDays !== 30 || body.ok !== true) {
      throw new Error("discovery_export_refused");
    }
    return body;
  } finally {
    if (fetchImpl) globalThis.fetch = saved;
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
      if (known.some(key => !Object.hasOwn(args, key)) || Object.keys(args).some(key => key !== "_" && !known.includes(key))) {
        throw new Error("discovery_export_unauthenticated");
      }
      const lines = await exportHostedLog({ origin: args["--origin"], date: args["--date"], authFile: args["--auth-file"] });
      process.stdout.write(lines.length ? `${lines.join("\n")}\n` : "");
    } else if (command === "retain") {
      if (!args["--received"]) throw new Error("discovery_retain_not_received");
      const known = ["--origin", "--auth-file", "--received"];
      if (args["--as-of"]) known.push("--as-of");
      if (known.filter(key => key !== "--as-of").some(key => !Object.hasOwn(args, key)) || Object.keys(args).some(key => key !== "_" && !known.includes(key))) {
        throw new Error("discovery_export_unauthenticated");
      }
      const receipt = await retainHostedLog({ origin: args["--origin"], authFile: args["--auth-file"], asOf: args["--as-of"] });
      process.stdout.write(`${JSON.stringify(receipt)}\n`);
    } else {
      throw new Error("discovery_export_unauthenticated");
    }
  } catch (error) {
    refuse(error);
  }
}
