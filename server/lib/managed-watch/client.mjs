#!/usr/bin/env node
// Cold machine client for the opt-in retained watch.
// The bearer token is read from a 0600 file. It is not accepted on argv.
import { readFile, stat } from "node:fs/promises";

function args(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const key = token.slice(2);
    const value = rest[i + 1];
    if (value === undefined || value.startsWith("--")) flags[key] = true;
    else { flags[key] = value; i += 1; }
  }
  return { command, flags };
}

async function tokenFrom(file) {
  const info = await stat(file);
  if ((info.mode & 0o077) !== 0) throw new Error("token file must be mode 0600");
  return (await readFile(file, "utf8")).trim();
}

async function call(base, method, path, token, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: response.status, json };
}

const { command, flags } = args(process.argv.slice(2));
if (!command || command === "help") {
  process.stdout.write(`${JSON.stringify({
    commands: ["enroll", "get", "due", "pause", "resume", "cancel", "healthz"],
    token: "pass --token-file with mode 0600",
    paidServiceLaunch: false,
    subscriptionOffered: false,
    proposedManagedPrice: null,
  }, null, 2)}\n`);
  process.exit(0);
}
const base = String(flags.base || "").replace(/\/$/, "");
if (!base) throw new Error("--base is required");
if (command === "healthz") {
  const response = await fetch(`${base}/api/managed-watch/healthz`, { redirect: "manual" });
  process.stdout.write(await response.text());
  process.exit(response.ok ? 0 : 1);
}
const token = await tokenFrom(flags["token-file"]);
const task = flags.task;
let result;
if (command === "enroll") {
  result = await call(base, "POST", "/api/managed-watch/enrollments", token, JSON.parse(await readFile(flags["body-file"], "utf8")));
} else if (command === "get") {
  result = await call(base, "GET", `/api/managed-watch/enrollments/${task}`, token);
} else if (command === "due") {
  result = await call(base, "POST", "/api/managed-watch/due", token, {});
} else if (command === "pause" || command === "resume" || command === "cancel") {
  result = await call(base, "POST", `/api/managed-watch/enrollments/${task}/${command}`, token, {});
} else {
  throw new Error(`unknown command ${command}`);
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(result.status >= 200 && result.status < 300 ? 0 : 1);
