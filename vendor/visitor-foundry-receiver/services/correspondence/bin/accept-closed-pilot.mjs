#!/usr/bin/env node
/**
 * One-shot closed-pilot acceptance against the real HTTP path.
 *
 * Local (default): requires a built dist/; starts a disposable Node process against
 * CORRESPONDENCE_TEST_DATABASE_URL, runs checks including process restart, then exits.
 * Refuses production DATABASE_URL unless CORRESPONDENCE_ACCEPT_ALLOW_SHARED_DB=1.
 *
 * Remote: CORRESPONDENCE_ACCEPT_BASE_URL=https://… plus admin token via
 * CORRESPONDENCE_ACCEPT_ADMIN_TOKEN_FILE (preferred) or CORRESPONDENCE_ADMIN_TOKEN.
 * Creates only an explicit trial tenant titled with the S29 marker; no public posts,
 * no payment. Restart persistence is skipped (operator owns the remote process).
 *
 * Checks:
 *   healthz · missing-token reject · idempotent create · dual clients (writer+reader)
 *   cursor after empty page then correction · cross-tenant deny · restart (local)
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import {
  boundedApi,
  canonicalOperatorOrigin,
  publicApiError,
  readPrivateSecret,
  replacePrivateJson,
} from "./safe-io.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TRIAL_MARKER = "S29-closed-pilot-accept";
const ADMIN_MIN = 24;

function mint(prefix) {
  return `${prefix}-${randomBytes(12).toString("base64url")}`;
}

function readAdminToken() {
  const file = process.env.CORRESPONDENCE_ACCEPT_ADMIN_TOKEN_FILE;
  if (file) {
    return readPrivateSecret(file, ADMIN_MIN);
  }
  const env = process.env.CORRESPONDENCE_ADMIN_TOKEN || process.env.CORRESPONDENCE_ACCEPT_ADMIN_TOKEN;
  if (!env || env.length < ADMIN_MIN) {
    throw new Error(
      "admin token required via CORRESPONDENCE_ACCEPT_ADMIN_TOKEN_FILE or CORRESPONDENCE_ADMIN_TOKEN",
    );
  }
  return env;
}

function assertHttpsOrLoopback(baseUrl) {
  return canonicalOperatorOrigin(baseUrl, "accept base URL");
}

async function api(baseUrl, method, path, { token, body, idempotencyKey } = {}) {
  return boundedApi(baseUrl, method, path, { token, body, idempotencyKey });
}

function fail(step, detail) {
  throw new Error(`[${step}] ${detail}`);
}

async function waitHealth(baseUrl, attempts = 50) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const r = await api(baseUrl, "GET", "/healthz");
      if (r.status === 200 && r.json?.ok === true) return r.json;
    } catch {
      /* retry */
    }
    await sleep(100);
  }
  fail("healthz", `service did not become healthy at ${baseUrl}`);
}

async function runChecks(baseUrl, adminToken) {
  const checks = [];
  const pass = (name, ok, detail = null) => {
    checks.push({ name, ok, detail });
    if (!ok) fail(name, detail || "failed");
  };

  const health = await waitHealth(baseUrl);
  pass("healthz", health.ok === true, `store=${health.store ?? health.kind ?? "unknown"}`);

  const missing = await api(baseUrl, "POST", "/v1/projects", {
    body: { title: `${TRIAL_MARKER} missing-token`, summary: "must reject" },
    idempotencyKey: mint("missing"),
  });
  pass("missing-token-reject", missing.status === 401, `status=${missing.status}`);

  const createKey = mint("s29-create");
  const title = `${TRIAL_MARKER} ${createKey.slice(-8)}`;
  const summary = "Disposable S29 acceptance tenant. Not a public post. No payment.";
  const created = await api(baseUrl, "POST", "/v1/projects", {
    token: adminToken,
    idempotencyKey: createKey,
    body: { title, summary },
  });
  if (created.status !== 201) {
    fail("idempotent-create", `expected 201 got ${created.status} ${JSON.stringify(publicApiError(created))}`);
  }
  const projectId = created.json.project.id;
  const ownerToken = created.json.ownerToken;
  if (!projectId || !ownerToken) fail("idempotent-create", "missing project/ownerToken");

  const replay = await api(baseUrl, "POST", "/v1/projects", {
    token: adminToken,
    idempotencyKey: createKey,
    body: { title, summary },
  });
  pass(
    "idempotent-create",
    replay.status === 200 &&
      replay.json.project.id === projectId &&
      replay.json.ownerToken === ownerToken,
    `status=${replay.status} sameProject=${replay.json?.project?.id === projectId}`,
  );

  const writerGrant = await api(baseUrl, "POST", `/v1/projects/${projectId}/grants`, {
    token: ownerToken,
    body: { role: "writer" },
  });
  const readerGrant = await api(baseUrl, "POST", `/v1/projects/${projectId}/grants`, {
    token: ownerToken,
    body: { role: "reader" },
  });
  if (writerGrant.status !== 201 || readerGrant.status !== 201) {
    fail("dual-clients", `grants ${writerGrant.status}/${readerGrant.status}`);
  }
  const writerToken = writerGrant.json.token;
  const readerToken = readerGrant.json.token;

  const request = await api(baseUrl, "POST", `/v1/projects/${projectId}/events`, {
    token: writerToken,
    idempotencyKey: mint("req"),
    body: { kind: "request", text: "acceptance request from writer client" },
  });
  if (request.status !== 201) fail("dual-clients", `writer post ${request.status}`);

  const readerSee = await api(baseUrl, "GET", `/v1/projects/${projectId}/events?limit=10`, {
    token: readerToken,
  });
  const cursor = readerSee.json?.nextCursor;
  pass(
    "dual-clients",
    readerSee.status === 200 && readerSee.json.events.length === 1 && Boolean(cursor),
    `events=${readerSee.json?.events?.length} cursor=${Boolean(cursor)}`,
  );

  const emptyPage = await api(
    baseUrl,
    "GET",
    `/v1/projects/${projectId}/events?after=${encodeURIComponent(cursor)}&limit=10`,
    { token: readerToken },
  );
  if (emptyPage.status !== 200 || emptyPage.json.events.length !== 0) {
    fail(
      "cursor-after-empty",
      `expected empty page got ${emptyPage.status} n=${emptyPage.json?.events?.length}`,
    );
  }

  const correction = await api(baseUrl, "POST", `/v1/projects/${projectId}/events`, {
    token: writerToken,
    idempotencyKey: mint("corr"),
    body: { kind: "correction", text: "acceptance correction after empty cursor page" },
  });
  if (correction.status !== 201) fail("cursor-after-empty", `correction post ${correction.status}`);

  const resumed = await api(
    baseUrl,
    "GET",
    `/v1/projects/${projectId}/events?after=${encodeURIComponent(cursor)}&limit=10`,
    { token: readerToken },
  );
  pass(
    "cursor-after-empty",
    resumed.status === 200 &&
      resumed.json.events.length === 1 &&
      resumed.json.events[0].kind === "correction",
    `events=${resumed.json?.events?.length} kind=${resumed.json?.events?.[0]?.kind}`,
  );

  const other = await api(baseUrl, "POST", "/v1/projects", {
    token: adminToken,
    idempotencyKey: mint("s29-other"),
    body: {
      title: `${TRIAL_MARKER} other-tenant`,
      summary: "Second tenant for cross-tenant deny only.",
    },
  });
  if (other.status !== 201) fail("cross-tenant-deny", `other create ${other.status}`);
  const otherId = other.json.project.id;
  const otherOwner = other.json.ownerToken;

  const crossProject = await api(baseUrl, "GET", `/v1/projects/${otherId}`, { token: writerToken });
  const crossCursor = await api(
    baseUrl,
    "GET",
    `/v1/projects/${otherId}/events?after=${encodeURIComponent(cursor)}`,
    { token: otherOwner },
  );
  const crossWrite = await api(baseUrl, "POST", `/v1/projects/${otherId}/events`, {
    token: writerToken,
    idempotencyKey: mint("xwrite"),
    body: { kind: "request", text: "must deny" },
  });
  // Cross-tenant access is refused as 404 (existence-hiding) or 403/401.
  const denied = (status) => status === 404 || status === 403 || status === 401;
  pass(
    "cross-tenant-deny",
    denied(crossProject.status) &&
      (crossCursor.status === 400 || denied(crossCursor.status)) &&
      denied(crossWrite.status),
    `project=${crossProject.status} cursor=${crossCursor.status} write=${crossWrite.status}`,
  );

  return { checks, projectId, ownerToken, createKey, title, summary };
}

async function persistenceAfterRestart(baseUrl, adminToken, handles) {
  await waitHealth(baseUrl);
  const replay = await api(baseUrl, "POST", "/v1/projects", {
    token: adminToken,
    idempotencyKey: handles.createKey,
    body: { title: handles.title, summary: handles.summary },
  });
  if (!(replay.status === 200 && replay.json.project.id === handles.projectId)) {
    fail("restart-persistence", `idempotent replay after restart status=${replay.status}`);
  }
  const page = await api(baseUrl, "GET", `/v1/projects/${handles.projectId}/events?limit=10`, {
    token: handles.ownerToken,
  });
  if (page.status !== 200 || page.json.events.length < 2) {
    fail("restart-persistence", `events after restart n=${page.json?.events?.length}`);
  }
  return { name: "restart-persistence", ok: true, detail: `events=${page.json.events.length}` };
}

function pickPort() {
  return 18000 + (randomBytes(2).readUInt16BE(0) % 2000);
}

async function startLocalServer({ databaseUrl, adminToken, port }) {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    CORRESPONDENCE_STORE: "postgres",
    DATABASE_URL: databaseUrl,
    CORRESPONDENCE_ADMIN_TOKEN: adminToken,
    CORRESPONDENCE_CORS_ORIGINS: "https://neomorphic.io",
    CORRESPONDENCE_TRUST_PROXY: "0",
    CORRESPONDENCE_RATE_LIMIT_MAX: "10000",
  };
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  child.stdout.on("data", () => {});
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitHealth(baseUrl, 50);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`${error.message}\nserver stderr:\n${stderr.slice(-1200)}`);
  }
  return { child, baseUrl };
}

async function stopChild(child) {
  if (!child || child.exitCode != null) return;
  child.kill("SIGTERM");
  await sleep(400);
  if (child.exitCode == null) child.kill("SIGKILL");
  await sleep(100);
}

async function migrate(databaseUrl) {
  const child = spawn(process.execPath, ["dist/migrate.js"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let err = "";
  child.stderr.on("data", (c) => {
    err += c.toString("utf8");
  });
  const code = await new Promise((resolvePromise) => child.on("exit", resolvePromise));
  if (code !== 0) throw new Error(`migrate exit ${code}: ${err.slice(-500)}`);
}

async function main() {
  const remoteUrl = process.env.CORRESPONDENCE_ACCEPT_BASE_URL?.trim();
  const adminToken = readAdminToken();

  const report = {
    schema: "neomorphic.correspondence.accept.v1",
    mode: remoteUrl ? "remote" : "local",
    marker: TRIAL_MARKER,
    startedAt: new Date().toISOString(),
    checks: [],
    ok: false,
  };

  if (remoteUrl) {
    const baseUrl = assertHttpsOrLoopback(remoteUrl);
    const first = await runChecks(baseUrl, adminToken);
    report.checks = first.checks;
    report.checks.push({
      name: "restart-persistence",
      ok: true,
      detail: "skipped-remote-operator-owns-process-lifecycle",
    });
    report.trialProjectId = first.projectId;
    report.ok = report.checks.every((c) => c.ok);
  } else {
    const databaseUrl =
      process.env.CORRESPONDENCE_TEST_DATABASE_URL ||
      (process.env.CORRESPONDENCE_ACCEPT_ALLOW_SHARED_DB === "1"
        ? process.env.DATABASE_URL || process.env.CORRESPONDENCE_DATABASE_URL
        : null);
    if (!databaseUrl) {
      throw new Error(
        "Local accept requires CORRESPONDENCE_TEST_DATABASE_URL (disposable). Refusing shared DATABASE_URL unless CORRESPONDENCE_ACCEPT_ALLOW_SHARED_DB=1.",
      );
    }
    if (!existsSync(join(ROOT, "dist/index.js")) || !existsSync(join(ROOT, "dist/migrate.js"))) {
      throw new Error("dist/index.js or dist/migrate.js missing; run npm run build first");
    }

    await migrate(databaseUrl);

    const port = pickPort();
    let server = await startLocalServer({ databaseUrl, adminToken, port });
    try {
      const first = await runChecks(server.baseUrl, adminToken);
      report.checks = first.checks;
      report.trialProjectId = first.projectId;

      await stopChild(server.child);
      server = await startLocalServer({ databaseUrl, adminToken, port });
      const restarted = await persistenceAfterRestart(server.baseUrl, adminToken, first);
      report.checks.push(restarted);
      report.ok = report.checks.every((c) => c.ok);
    } finally {
      await stopChild(server?.child);
    }
  }

  report.finishedAt = new Date().toISOString();
  const outPath = join(ROOT, ".scratch/s29-accept/report.json");
  replacePrivateJson(outPath, report);

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
  process.exit(1);
});
