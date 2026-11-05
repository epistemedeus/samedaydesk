#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = parseArgs(process.argv.slice(2));
if (!args.url || !args.home) {
  process.stderr.write("provision-ghost requires --url and --home\n");
  process.exit(2);
}

const home = args.home;
mkdirSync(home, { recursive: true });
const keyFile = join(home, "admin-api-key");
const contentFile = join(home, "content-api-key");
const ownerFile = join(home, "owner.secret");

if (existsSync(keyFile) && readNonEmpty(keyFile)) {
  process.stdout.write(`${JSON.stringify({ ok: true, action: "unchanged", keyFilePresent: true })}\n`);
  process.exit(0);
}

const setup = await readSetup(args.url);
if (!setup.ok) fail(setup.message);

let owner = readOwner(ownerFile);
if (!setup.ready) {
  if (!owner) {
    owner = {
      name: "Runtime Owner",
      email: "sdd-runtime-owner@example.com",
      password: makePassword(),
      blogTitle: "SameDayDesk result-reuse lab",
    };
    writeSecretFile(ownerFile, encodeOwner(owner));
  }
  const created = await postJson(`${args.url}/ghost/api/admin/authentication/setup/`, {
    setup: [{
      name: owner.name,
      email: owner.email,
      password: owner.password,
      blogTitle: owner.blogTitle,
    }],
  }, { Origin: args.url });
  if (!created.ok && !/already/.test(String(created.message || "").toLowerCase())) {
    fail(created.message || "ghost setup failed");
  }
} else if (!owner) {
  fail("ghost is already set up but owner.secret is missing; cannot create an Admin API key");
}

const session = await createSession(args.url, owner);
if (!session.ok) fail(session.message);

const integration = await postJson(`${args.url}/ghost/api/admin/integrations/`, {
  integrations: [{
    name: "sdd-result-reuse",
    description: "Local Admin API access for unpublished result-reuse drafts",
  }],
}, { Origin: args.url, Cookie: session.cookie });
if (!integration.ok) fail(integration.message);
const record = integration.json?.integrations?.[0];
const admin = (record?.api_keys || []).find((item) => item.type === "admin");
const content = (record?.api_keys || []).find((item) => item.type === "content");
if (!admin?.id || !admin?.secret) fail("ghost integration did not return an admin API key");
writeSecretFile(keyFile, `${admin.id}:${admin.secret}\n`);
if (content?.secret) writeSecretFile(contentFile, `${content.secret}\n`);
process.stdout.write(`${JSON.stringify({
  ok: true,
  action: "provisioned",
  keyFilePresent: true,
  contentKeyFilePresent: Boolean(content?.secret),
  integrationId: record?.id ?? null,
})}\n`);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--url") out.url = String(argv[++i] || "").replace(/\/+$/, "");
    else if (argv[i] === "--home") out.home = argv[++i];
    else fail("unknown option");
  }
  return out;
}

function fail(message) {
  process.stderr.write(`${JSON.stringify({ ok: false, message: String(message) })}\n`);
  process.exit(1);
}

function readNonEmpty(path) {
  try {
    return readFileSync(path, "utf8").trim() !== "";
  } catch {
    return false;
  }
}

function readOwner(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed?.email && parsed?.password) return parsed;
    return null;
  } catch {
    return null;
  }
}

function encodeOwner(owner) {
  return `${JSON.stringify(owner)}\n`;
}

function writeSecretFile(path, contents) {
  writeFileSync(path, contents, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function makePassword() {
  return `Sdd-Runtime-${randomBytes(18).toString("base64url")}`;
}

async function readSetup(url) {
  try {
    const res = await fetch(`${url}/ghost/api/admin/authentication/setup/`, {
      headers: { Accept: "application/json", Origin: url },
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: `setup probe returned ${res.status}` };
    const status = json?.setup?.[0]?.status;
    return { ok: true, ready: status === true };
  } catch (error) {
    return { ok: false, message: error?.cause?.code || "cannot probe ghost setup" };
  }
}

async function createSession(url, owner) {
  try {
    const res = await fetch(`${url}/ghost/api/admin/session/`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: url,
      },
      body: JSON.stringify({ username: owner.email, password: owner.password }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, message: `session create returned ${res.status}` };
    const cookies = typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")] : []);
    const cookie = cookies.map((item) => String(item).split(";")[0]).filter(Boolean).join("; ");
    if (!cookie) return { ok: false, message: "ghost session did not return a cookie" };
    return { ok: true, cookie };
  } catch {
    return { ok: false, message: "cannot create ghost admin session" };
  }
}

async function postJson(url, body, headers = {}) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const first = json?.errors?.[0]?.message;
      return { ok: false, status: res.status, message: first || `POST ${urlPath(url)} returned ${res.status}` };
    }
    return { ok: true, status: res.status, json };
  } catch {
    return { ok: false, message: `cannot POST ${urlPath(url)}` };
  }
}

function urlPath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "request";
  }
}

