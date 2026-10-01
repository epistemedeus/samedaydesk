#!/usr/bin/env node
/**
 * Closed-pilot operator CLI for correspondence trial projects.
 *
 * Credentials are read from regular, non-symlink files (mode 0600); never logged.
 * Reuses existing admin bootstrap + Idempotency-Key replay — no second auth system.
 *
 * Commands:
 *   create-trial   Create or recover a trial project (idempotent)
 *   issue-grant    Issue writer|reader grant from owner token
 *   status         GET project with a scoped grant
 *   post-event     Post one event (request|reply|artifact|correction|...)
 *   list-events    List events with optional after cursor
 */

import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  boundedApi,
  canonicalOperatorOrigin,
  inspectPrivateDestination,
  publicApiError,
  readPrivateJson,
  readPrivateSecret,
  replacePrivateJson,
  withPrivateLock,
  writeJsonNoClobber,
  writeSecretNoClobber,
} from "./safe-io.mjs";

function usage(code = 1) {
  process.stderr.write(`Usage:
  node bin/pilot-trial.mjs create-trial --base-url URL --admin-token-file PATH --state-file PATH [--title T] [--summary S] [--key KEY]
  node bin/pilot-trial.mjs issue-grant --base-url URL --state-file PATH --role writer|reader [--out-token-file PATH]
  node bin/pilot-trial.mjs status --base-url URL --state-file PATH
  node bin/pilot-trial.mjs post-event --base-url URL --token-file PATH --project-id ID --kind KIND [--text TEXT] [--artifact-url URL] [--key KEY]
  node bin/pilot-trial.mjs list-events --base-url URL --token-file PATH --project-id ID [--after CURSOR] [--limit N]
`);
  process.exit(code);
}

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

function assertHttpsOrLoopback(baseUrl) {
  return canonicalOperatorOrigin(baseUrl, "base-url");
}

function mintKey(prefix = "s29-trial") {
  return `${prefix}-${randomBytes(16).toString("base64url")}`;
}

async function api(baseUrl, method, path, { token, body, idempotencyKey } = {}) {
  return boundedApi(baseUrl, method, path, { token, body, idempotencyKey });
}

function print(value) {
  // Never dump bearer tokens unless the caller is writing them to a secret file.
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function createTrial(opts) {
  const baseUrl = assertHttpsOrLoopback(opts["base-url"]);
  const stateFile = resolve(opts["state-file"] || ".pilot/correspondence-trial.json");
  return withPrivateLock(stateFile, async () => {
    const existing = readPrivateJson(stateFile);
    const requestedOwnerTokenFile = resolve(opts["owner-token-file"] || ".pilot/owner.token");
    if (!existing && inspectPrivateDestination(requestedOwnerTokenFile).exists) {
      throw new Error("owner token file already exists without matching trial state; refusing project creation");
    }
    if (existing) {
      if (existing.schema !== "neomorphic.correspondence.trial-state.v1") throw new Error("unsupported trial state schema");
      if (existing.baseUrl !== baseUrl) throw new Error("base-url does not match the saved trial origin");
      for (const [option, field] of [["key", "idempotencyKey"], ["title", "title"], ["summary", "summary"]]) {
        if (opts[option] != null && String(opts[option]) !== existing[field]) {
          throw new Error(`--${option} does not match the immutable saved request intent`);
        }
      }
      if (opts["owner-token-file"] && requestedOwnerTokenFile !== existing.ownerTokenFile) {
        throw new Error("--owner-token-file does not match the immutable saved request intent");
      }
    }
    const intent = existing ?? {
      schema: "neomorphic.correspondence.trial-state.v1",
      phase: "pending_project",
      baseUrl,
      idempotencyKey: String(opts.key || mintKey()),
      title: String(opts.title || "Closed-pilot shared task trial"),
      summary: String(opts.summary || "S29 disposable trial tenant for invited operator use. Not a public marketplace."),
      ownerTokenFile: requestedOwnerTokenFile,
      createdAt: new Date().toISOString(),
    };
    if (!existing) writeJsonNoClobber(stateFile, intent);

    if (!opts["admin-token-file"]) throw new Error("admin token required via --admin-token-file");
    const adminToken = readPrivateSecret(opts["admin-token-file"]);
    const result = await api(baseUrl, "POST", "/v1/projects", {
      token: adminToken,
      idempotencyKey: intent.idempotencyKey,
      body: { title: intent.title, summary: intent.summary },
    });

    if (result.status === 409 && result.json?.error?.code === "bootstrap_recovery_required") {
      print({
        ok: false,
        code: "bootstrap_recovery_required",
        message: "The original project is preserved; do not mint a new key. Reconcile via a surviving owner grant.",
        projectId: intent.projectId ?? null,
        idempotencyKey: intent.idempotencyKey,
      });
      process.exitCode = 2;
      return;
    }
    if (result.status !== 200 && result.status !== 201) {
      print({ ok: false, status: result.status, error: publicApiError(result) });
      process.exitCode = 1;
      return;
    }
    const project = result.json?.project;
    const ownerToken = result.json?.ownerToken;
    if (!project?.id || typeof ownerToken !== "string") throw new Error("server success response omitted project or owner token");
    writeSecretNoClobber(intent.ownerTokenFile, ownerToken);
    replacePrivateJson(stateFile, {
      ...intent,
      phase: "active",
      projectId: project.id,
      version: project.version,
      status: project.status,
      replayed: result.status === 200,
      updatedAt: new Date().toISOString(),
    });
    print({
      ok: true,
      replayed: result.status === 200,
      projectId: project.id,
      version: project.version,
      status: project.status,
      idempotencyKey: intent.idempotencyKey,
      ownerTokenFile: intent.ownerTokenFile,
      stateFile,
    });
  });
}

async function issueGrant(opts) {
  const baseUrl = assertHttpsOrLoopback(opts["base-url"]);
  const state = readPrivateJson(resolve(opts["state-file"]));
  if (!state?.projectId || !state?.ownerTokenFile) throw new Error("state-file missing project/owner token path");
  if (state.baseUrl !== baseUrl) throw new Error("base-url does not match the saved trial origin");
  const role = opts.role === "reader" ? "reader" : opts.role === "writer" ? "writer" : null;
  if (!role) throw new Error("--role must be writer or reader");
  const out = resolve(opts["out-token-file"] || `.pilot/${role}.token`);
  const intentFile = `${out}.grant-intent.json`;
  return withPrivateLock(intentFile, async () => {
    const existing = readPrivateJson(intentFile);
    if (existing) {
      if (
        existing.baseUrl !== baseUrl ||
        existing.projectId !== state.projectId ||
        existing.role !== role ||
        existing.tokenFile !== out
      ) {
        throw new Error("saved grant intent does not match this request");
      }
      if (existing.phase === "active") {
        readPrivateSecret(out);
        print({ ok: true, replayed: true, grantId: existing.grantId, role, tokenFile: out, projectId: state.projectId });
        return;
      }
      throw new Error("grant outcome is unknown; refusing a duplicate grant request. Reconcile or choose a new explicit token path");
    }
    if (inspectPrivateDestination(out).exists) {
      throw new Error("token file already exists without a matching grant intent; refusing to create a duplicate grant");
    }
    const intent = {
      schema: "neomorphic.correspondence.grant-intent.v1",
      phase: "pending_grant",
      baseUrl,
      projectId: state.projectId,
      role,
      tokenFile: out,
      createdAt: new Date().toISOString(),
    };
    writeJsonNoClobber(intentFile, intent);
    const ownerToken = readPrivateSecret(state.ownerTokenFile);
    const result = await api(baseUrl, "POST", `/v1/projects/${encodeURIComponent(state.projectId)}/grants`, {
      token: ownerToken,
      body: { role },
    });
    if (result.status !== 201) {
      print({ ok: false, status: result.status, error: publicApiError(result) });
      process.exitCode = 1;
      return;
    }
    if (typeof result.json?.token !== "string" || !result.json?.grantId) throw new Error("server success response omitted grant token or id");
    writeSecretNoClobber(out, result.json.token);
    replacePrivateJson(intentFile, {
      ...intent,
      phase: "active",
      grantId: result.json.grantId,
      updatedAt: new Date().toISOString(),
    });
    print({ ok: true, replayed: false, grantId: result.json.grantId, role: result.json.role, tokenFile: out, projectId: state.projectId });
  });
}

async function status(opts) {
  const baseUrl = assertHttpsOrLoopback(opts["base-url"]);
  const state = readPrivateJson(resolve(opts["state-file"]));
  if (!state?.projectId || !state?.ownerTokenFile) throw new Error("state-file incomplete");
  if (state.baseUrl !== baseUrl) throw new Error("base-url does not match the saved trial origin");
  const token = readPrivateSecret(opts["token-file"] || state.ownerTokenFile);
  const result = await api(baseUrl, "GET", `/v1/projects/${encodeURIComponent(state.projectId)}`, { token });
  if (result.status !== 200) {
    print({ ok: false, status: result.status, error: publicApiError(result) });
    process.exitCode = 1;
    return;
  }
  print({ ok: true, project: result.json.project });
}

async function postEvent(opts) {
  const baseUrl = assertHttpsOrLoopback(opts["base-url"]);
  const token = readPrivateSecret(opts["token-file"]);
  const projectId = opts["project-id"];
  if (!projectId) throw new Error("--project-id required");
  const kind = opts.kind;
  if (!kind) throw new Error("--kind required");
  const body = { kind };
  if (opts.text) body.text = String(opts.text);
  if (opts["artifact-url"]) {
    body.artifact = { url: String(opts["artifact-url"]), ...(opts["artifact-label"] ? { label: String(opts["artifact-label"]) } : {}) };
  }
  if (opts["expected-version"] != null) body.expectedVersion = Number(opts["expected-version"]);
  const key = String(opts.key || mintKey("s29-event"));
  const result = await api(baseUrl, "POST", `/v1/projects/${encodeURIComponent(projectId)}/events`, {
    token,
    idempotencyKey: key,
    body,
  });
  if (result.status !== 200 && result.status !== 201) {
    print({ ok: false, status: result.status, error: publicApiError(result) });
    process.exitCode = 1;
    return;
  }
  print({
    ok: true,
    replayed: result.status === 200,
    eventId: result.json.event.id,
    sequence: result.json.event.sequence,
    kind: result.json.event.kind,
    projectVersion: result.json.project.version,
    idempotencyKey: key,
  });
}

async function listEvents(opts) {
  const baseUrl = assertHttpsOrLoopback(opts["base-url"]);
  const token = readPrivateSecret(opts["token-file"]);
  const projectId = opts["project-id"];
  if (!projectId) throw new Error("--project-id required");
  const search = new URLSearchParams();
  if (opts.after) search.set("after", String(opts.after));
  if (opts.limit) search.set("limit", String(opts.limit));
  const suffix = search.toString() ? `?${search}` : "";
  const result = await api(baseUrl, "GET", `/v1/projects/${encodeURIComponent(projectId)}/events${suffix}`, { token });
  if (result.status !== 200) {
    print({ ok: false, status: result.status, error: publicApiError(result) });
    process.exitCode = 1;
    return;
  }
  print({
    ok: true,
    count: result.json.events.length,
    nextCursor: result.json.nextCursor ?? null,
    events: result.json.events.map((e) => ({ id: e.id, sequence: e.sequence, kind: e.kind })),
  });
}

async function main() {
  const opts = args(process.argv.slice(2));
  if (opts.help || opts._.length === 0) usage(opts.help ? 0 : 1);
  const cmd = opts._[0];
  try {
    if (cmd === "create-trial") await createTrial(opts);
    else if (cmd === "issue-grant") await issueGrant(opts);
    else if (cmd === "status") await status(opts);
    else if (cmd === "post-event") await postEvent(opts);
    else if (cmd === "list-events") await listEvents(opts);
    else usage(1);
  } catch (error) {
    print({ ok: false, error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}

export { createTrial, issueGrant, status, api, assertHttpsOrLoopback, mintKey };
