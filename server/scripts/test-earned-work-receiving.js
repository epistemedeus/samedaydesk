import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { inspectEarnedWorkMountEnv } from "@neomorphic/earned-work-host";
import { createSdsApp } from "../app.js";
import { runObjectiveTask } from "../earned-work/objective-task.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCHEMA = "pilot_earned_work";
const PAYOUT_SECRET = "payout-secret-do-not-leak";
const REWARD_A = { amount: "0.10", asset: "USDC", network: "base" };
const REWARD_B = { amount: "0.20", asset: "USDC", network: "base" };

function databaseUrl() {
  const url = String(process.env.EARNED_WORK_DATABASE_URL || "").trim();
  if (!url) throw new Error("EARNED_WORK_DATABASE_URL is required for disposable Postgres acceptance");
  return url;
}

function quoteIdent(name) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new Error("bad identifier");
  return `"${name}"`;
}

function key(label) {
  return `test-${label}-${randomBytes(4).toString("hex")}`;
}

function cleanCorrespondenceEnv() {
  return { NODE_ENV: "test" };
}

function enabledEnv(extra = {}) {
  return {
    NODE_ENV: "test",
    EARNED_WORK_MOUNT: "1",
    EARNED_WORK_DATABASE_URL: databaseUrl(),
    EARNED_WORK_OWNER_TOKEN: extra.EARNED_WORK_OWNER_TOKEN || `owner-${randomBytes(8).toString("hex")}`,
    EARNED_WORK_PG_SCHEMA: SCHEMA,
    EARNED_WORK_POOL_MAX: "2",
    EARNED_WORK_RATE_LIMIT_MAX: "10000",
    EARNED_WORK_VERIFIER: "default",
    ...extra,
  };
}

function appFor(env) {
  return createSdsApp({
    earnedWork: { env },
    correspondence: { env: cleanCorrespondenceEnv() },
  });
}

function listen(app) {
  const server = createServer(app);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done, fail) => server.close((error) => (error ? fail(error) : done()))),
      });
    });
  });
}

async function json(base, route, init = {}) {
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);
  const response = await fetch(`${base}${route}`, { ...init, headers });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { status: response.status, body, text, headers: response.headers };
}

async function query(sql, params = []) {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    await client.end();
  }
}

async function dropSchema() {
  await query(`DROP SCHEMA IF EXISTS ${quoteIdent(SCHEMA)} CASCADE`);
}

function migrate(extraEnv = {}) {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    EARNED_WORK_DATABASE_URL: databaseUrl(),
    EARNED_WORK_PG_SCHEMA: SCHEMA,
    EARNED_WORK_POOL_MAX: "1",
    DATABASE_URL: "postgres://denied.invalid/must-not-be-used",
    ...extraEnv,
  };
  return spawnSync(process.execPath, ["server/earned-work/migrate.mjs"], {
    cwd: root,
    env,
    encoding: "utf8",
  });
}

function interruptPost(url, token, idempotencyKey, body) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        authorization: `Bearer ${token}`,
        "idempotency-key": idempotencyKey,
      },
    }, (res) => {
      res.once("data", () => req.destroy());
      res.on("end", () => resolve(res.statusCode ?? 0));
      res.on("error", () => resolve(res.statusCode ?? 0));
      res.on("aborted", () => resolve(res.statusCode ?? 0));
    });
    req.setTimeout(5000, () => { req.destroy(); resolve(0); });
    req.on("error", (error) => {
      if (error.code === "ECONNRESET" || error.code === "EPIPE") resolve(0);
      else reject(error);
    });
    req.end(body);
  });
}

async function createReservedTask(base, ownerToken, overrides = {}) {
  const stamp = randomBytes(3).toString("hex");
  const reward = overrides.reward || REWARD_A;
  const payload = {
    title: overrides.title || `Retained task ${stamp}`,
    summary: overrides.summary || "Hypothesis reward is not cash and not settled.",
    provenance: "test",
    reward,
    budget: overrides.budget || reward,
    terms: {
      summary: overrides.summary || "Hypothesis reward is not cash and not settled.",
      claimTtlSeconds: 3600,
      maxArtifactBytes: 8192,
      allowedMediaTypes: ["application/json", "text/plain"],
      slotLimit: 1,
    },
  };
  const created = await json(base, "/v1/tasks", {
    method: "POST",
    token: ownerToken,
    idempotencyKey: key("create"),
    body: JSON.stringify(payload),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const task = created.body.task;
  assert.match(task.termsVersion, /^sha256:[0-9a-f]{64}$/);
  const reserved = await json(base, `/v1/tasks/${task.id}/funding/reserve`, {
    method: "POST",
    token: ownerToken,
    idempotencyKey: key("reserve"),
    body: "{}",
  });
  assert.equal(reserved.status, 200, JSON.stringify(reserved.body));
  assert.equal(reserved.body.task.fundingState, "reserved");
  return { taskId: task.id, termsVersion: task.termsVersion };
}

async function issueScoped(base, ownerToken, taskId, expiresAt) {
  const created = await json(base, "/v1/contributor-tokens", {
    method: "POST",
    token: ownerToken,
    body: JSON.stringify({
      contributorPublicId: `ordinary-${randomBytes(3).toString("hex")}`,
      payoutDestination: PAYOUT_SECRET,
      provenance: "test",
      taskId,
      ...(expiresAt ? { expiresAt } : {}),
    }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body.token;
}

const { runOrdinaryContributor, evidenceArtifact } = await import("@neomorphic/earned-work-host/contributor");

test("mount stays disabled for a generic database URL and reports ready or disabled", async () => {
  const inspected = inspectEarnedWorkMountEnv({
    DATABASE_URL: "postgres://no-such-host.invalid:1/should_not_connect",
  });
  assert.equal(inspected.kind, "unconfigured");
  const app = appFor({
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl(),
    EARNED_WORK_PG_SCHEMA: "public",
  });
  const mount = app.get("earnedWorkMount");
  const server = await listen(app);
  try {
    await mount.ready();
    assert.equal(mount.state.status, "disabled");
    assert.equal(mount.state.reason, "unconfigured");
    const health = await json(server.origin, "/api/health");
    assert.equal(health.status, 200);
    assert.equal(health.body.service, "samedaydesk");
    assert.equal(JSON.stringify(health.body).includes("not deployed"), false);
    const earned = await json(server.origin, "/api/earned-work/healthz");
    assert.equal(earned.status, 200);
    assert.equal(earned.body.enabled, false);
    assert.equal(earned.body.reason, "unconfigured");
    assert.equal(JSON.stringify(earned.body).includes("not deployed"), false);
    const blocked = await json(server.origin, "/api/earned-work/v1/tasks");
    assert.equal(blocked.status, 503);
    assert.equal(blocked.body.error.code, "unconfigured");
    const correspondence = await json(server.origin, "/api/correspondence/healthz");
    assert.equal(correspondence.status, 200);
    assert.equal(correspondence.body.enabled, false);
    assert.equal(correspondence.body.reason, "unconfigured");
    const mcp = await json(server.origin, "/mcp", {
      method: "POST",
      headers: { accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "earned", version: "0" } },
      }),
    });
    assert.equal(mcp.status, 200);
    assert.equal(mcp.body.result.serverInfo.name, "samedaydesk-agent-tools");
    const checkout = await json(server.origin, "/api/checkout/create-payment-intent", {
      method: "POST",
      body: JSON.stringify({ offer: "none" }),
    });
    assert.ok(checkout.status === 401 || checkout.status === 503);
    assert.notEqual(checkout.status, 500);
  } finally {
    await mount.close();
    await server.close();
  }
  const publicTable = await query("SELECT to_regclass('public.earned_work_tasks') AS name");
  assert.equal(publicTable[0]?.name, null);
});

test("invalid mount config and the product Supabase project stay disabled", async () => {
  const refused = appFor(enabledEnv({ EARNED_WORK_PG_SCHEMA: "public" }));
  const refusedMount = refused.get("earnedWorkMount");
  const refusedServer = await listen(refused);
  try {
    await refusedMount.ready();
    assert.equal(refusedMount.state.reason, "invalid_config");
    const earned = await json(refusedServer.origin, "/api/earned-work/healthz");
    assert.equal(earned.body.enabled, false);
    assert.equal(earned.body.reason, "invalid_config");
    const health = await json(refusedServer.origin, "/api/health");
    assert.equal(health.status, 200);
  } finally {
    await refusedMount.close();
    await refusedServer.close();
  }

  const product = appFor(enabledEnv({
    EARNED_WORK_DATABASE_URL: "postgres://refused@db.arvmcttdegqwiwdaembr.supabase.co:5432/postgres",
    SUPABASE_URL: "https://arvmcttdegqwiwdaembr.supabase.co",
  }));
  const productMount = product.get("earnedWorkMount");
  const productServer = await listen(product);
  try {
    await productMount.ready();
    assert.equal(productMount.state.reason, "invalid_config");
    const earned = await json(productServer.origin, "/api/earned-work/healthz");
    assert.equal(earned.status, 200);
    assert.equal(earned.body.enabled, false);
    assert.equal(earned.body.reason, "invalid_config");
    const blocked = await json(productServer.origin, "/api/earned-work/v1/tasks");
    assert.equal(blocked.status, 503);
  } finally {
    await productMount.close();
    await productServer.close();
  }
});

test("contributor and migration refuse a generic database URL", () => {
  const contributor = spawnSync(process.execPath, ["server/earned-work/ordinary-contributor.mjs"], {
    cwd: root,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: "postgres://example.invalid/not-used" },
    encoding: "utf8",
  });
  assert.equal(contributor.status, 1);
  assert.match(contributor.stderr, /ordinary contributor refuses DATABASE_URL/);
  assert.equal(contributor.stdout, "");
  assert.doesNotMatch(contributor.stderr, /example\.invalid/);

  const migration = spawnSync(process.execPath, ["server/earned-work/migrate.mjs"], {
    cwd: root,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: "postgres://denied.invalid/not-used" },
    encoding: "utf8",
  });
  assert.equal(migration.status, 1);
  assert.match(migration.stderr, /EARNED_WORK_DATABASE_URL is required/);
  assert.doesNotMatch(migration.stderr, /denied\.invalid/);

  const host = readFileSync(path.join(root, "vendor/neomorphic-earned-work-host/dist/host-mount.js"), "utf8");
  const contributorSource = readFileSync(path.join(root, "server/earned-work/ordinary-contributor.mjs"), "utf8");
  for (const source of [host, contributorSource]) {
    assert.equal(source.includes("not deployed"), false);
    assert.doesNotMatch(source, /DROP SCHEMA/);
    assert.doesNotMatch(source, /services\/earned-work\/src/);
  }
  const pin = JSON.parse(readFileSync(path.join(root, "vendor/neomorphic-earned-work-host/SOURCE-PIN.json"), "utf8"));
  assert.equal(pin.kernelTree, "1a5dad7755fb81c75564dbc9d3667ab16db9bbcd");
  assert.equal(pin.kernelRewritten, false);
  const kernelPkg = JSON.parse(readFileSync(path.join(root, "vendor/neomorphic-earned-work-host/kernel/package.json"), "utf8"));
  assert.equal(kernelPkg.exports["./host"], undefined);
  assert.equal(JSON.stringify(kernelPkg.dependencies).includes("file:"), false);
});

test("createSdsApp keeps evidence across restart, changed terms, and disable", { timeout: 120_000 }, async () => {
  await dropSchema();
  const firstMigrate = migrate();
  assert.equal(firstMigrate.status, 0, firstMigrate.stderr);
  const secondMigrate = migrate();
  assert.equal(secondMigrate.status, 0, secondMigrate.stderr);
  assert.match(firstMigrate.stdout, /schema=pilot_earned_work/);
  assert.doesNotMatch(`${firstMigrate.stdout}\n${firstMigrate.stderr}`, /denied\.invalid/);

  const ownerToken = `owner-${randomBytes(8).toString("hex")}`;
  const env = enabledEnv({ EARNED_WORK_OWNER_TOKEN: ownerToken });
  const opened = appFor(env);
  const mount = opened.get("earnedWorkMount");
  const server = await listen(opened);
  const base = `${server.origin}/api/earned-work`;
  const evidence = Buffer.from(JSON.stringify({ note: "received-evidence", use: "retained-changed-task" }));
  const artifact = evidenceArtifact(evidence);
  try {
    await mount.ready();
    assert.equal(mount.state.status, "ready");
    const ready = await json(base, "/healthz");
    assert.equal(ready.status, 200);
    assert.equal(ready.body.ok, true);
    assert.equal(ready.body.enabled, true);
    assert.equal(ready.body.store, "postgres");
    assert.equal(JSON.stringify(ready.body).includes("not deployed"), false);
    const dedicated = await query(`SELECT to_regclass('${SCHEMA}.earned_work_tasks') AS name`);
    assert.equal(dedicated[0]?.name, `${SCHEMA}.earned_work_tasks`);
    const publicTable = await query("SELECT to_regclass('public.earned_work_tasks') AS name");
    assert.equal(publicTable[0]?.name, null);

    const absent = await json(base, "/v1/tasks", {
      method: "POST",
      idempotencyKey: key("absent"),
      body: JSON.stringify({ title: "no owner" }),
    });
    assert.equal(absent.status, 401);
    assert.equal(absent.body.error.code, "unauthorized");
    const malformed = await json(base, "/v1/tasks", {
      method: "POST",
      token: ownerToken,
      idempotencyKey: key("malformed"),
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error.code, "invalid_input");

    const health = await json(server.origin, "/api/health");
    assert.equal(health.status, 200);
    assert.equal(health.body.service, "samedaydesk");
    const mcp = await json(server.origin, "/mcp", {
      method: "POST",
      headers: { accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "earned", version: "0" } },
      }),
    });
    assert.equal(mcp.status, 200);
    assert.equal(mcp.body.result.serverInfo.name, "samedaydesk-agent-tools");
    const checkout = await json(server.origin, "/api/checkout/create-payment-intent", {
      method: "POST",
      body: JSON.stringify({ offer: "none" }),
    });
    assert.ok(checkout.status === 401 || checkout.status === 503);
    const correspondence = await json(server.origin, "/api/correspondence/healthz");
    assert.equal(correspondence.body.reason, "unconfigured");

    const first = await createReservedTask(base, ownerToken, {
      title: "First retained task",
      summary: "Hypothesis reward 0.10 USDC. Not cash and not settled.",
    });
    const token = await issueScoped(base, ownerToken, first.taskId);
    const listed = await json(base, "/v1/tasks");
    assert.equal(listed.status, 200);
    const listedText = JSON.stringify(listed.body);
    assert.equal(listedText.includes(PAYOUT_SECRET), false);
    assert.equal(listedText.includes(token), false);
    assert.equal(listedText.includes("payoutDestination"), false);
    assert.equal(listedText.includes(first.taskId), true);

    const claimKey = key("claim");
    const submitKey = key("submit");
    const qualified = await runOrdinaryContributor({
      baseUrl: base,
      token,
      taskId: first.taskId,
      mode: "qualify",
      claimIdempotencyKey: claimKey,
    });
    assert.equal(qualified.ok, true);
    assert.equal(qualified.paid, false);
    assert.equal(qualified.transfer, null);
    const reservationId = qualified.reservationId;
    const submitBody = JSON.stringify({
      reservationId,
      artifact,
      evidenceBase64: evidence.toString("base64"),
    });
    const interrupted = await interruptPost(
      `${base}/v1/tasks/${first.taskId}/submissions`,
      token,
      submitKey,
      submitBody,
    );
    assert.ok(interrupted === 201 || interrupted === 200 || interrupted === 0);
    const retried = await runOrdinaryContributor({
      baseUrl: base,
      token,
      taskId: first.taskId,
      mode: "submit",
      evidence,
      claimIdempotencyKey: claimKey,
      submitIdempotencyKey: submitKey,
    });
    assert.equal(retried.ok, true, JSON.stringify(retried));
    assert.equal(retried.paid, false);
    assert.equal(retried.transfer, null);
    const replayed = await runOrdinaryContributor({
      baseUrl: base,
      token,
      taskId: first.taskId,
      mode: "submit",
      evidence,
      claimIdempotencyKey: claimKey,
      submitIdempotencyKey: submitKey,
    });
    assert.equal(replayed.httpStatus, 200);
    assert.equal(replayed.submissionId, retried.submissionId);
    const counts = await query(
      `SELECT count(*)::int AS n FROM ${quoteIdent(SCHEMA)}.earned_work_submissions WHERE task_id = $1`,
      [first.taskId],
    );
    assert.equal(counts[0]?.n, 1);
    const submissionId = retried.submissionId;

    await mount.close();
    await server.close();
    const thirdMigrate = migrate();
    assert.equal(thirdMigrate.status, 0, thirdMigrate.stderr);

    const restartedApp = appFor(env);
    const restartedMount = restartedApp.get("earnedWorkMount");
    const restarted = await listen(restartedApp);
    const restartedBase = `${restarted.origin}/api/earned-work`;
    try {
      await restartedMount.ready();
      const view = await json(restartedBase, `/v1/tasks/${first.taskId}`, { token: ownerToken });
      assert.equal(view.status, 200);
      assert.equal(view.body.task.submission.id, submissionId);
      const stored = await query(
        `SELECT evidence_bytes FROM ${quoteIdent(SCHEMA)}.earned_work_submissions WHERE id = $1`,
        [submissionId],
      );
      assert.equal(Buffer.compare(stored[0].evidence_bytes, evidence), 0);
      assert.equal(createHash("sha256").update(stored[0].evidence_bytes).digest("hex"), artifact.digestSha256);

      const verdict = await json(restartedBase, `/v1/tasks/${first.taskId}/verdicts`, {
        method: "POST",
        token: ownerToken,
        idempotencyKey: key("verdict"),
        body: JSON.stringify({ reservationId }),
      });
      assert.equal(verdict.status, 201, JSON.stringify(verdict.body));
      assert.equal(verdict.body.verdict.outcome, "pass");
      const accepted = await json(restartedBase, `/v1/tasks/${first.taskId}/accept`, {
        method: "POST",
        token: ownerToken,
        idempotencyKey: key("accept"),
        body: JSON.stringify({ reservationId }),
      });
      assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
      const payout = await json(restartedBase, `/v1/tasks/${first.taskId}/payout`, { token: ownerToken });
      assert.equal(payout.status, 200);
      assert.equal(payout.body.reconciliation.adapter, "null_nonpaying_v0");
      assert.equal(payout.body.reconciliation.owed, true);
      assert.equal(payout.body.reconciliation.paying, false);
      assert.equal(payout.body.reconciliation.paid, false);
      assert.equal(payout.body.reconciliation.settled, false);
      assert.equal(payout.body.reconciliation.transfer, null);
      const owed = await runOrdinaryContributor({ baseUrl: restartedBase, token, taskId: first.taskId, mode: "read" });
      assert.equal(owed.ok, true);
      assert.equal(owed.readback, "owed");
      assert.equal(owed.paid, false);
      assert.equal(owed.transfer, null);
      const obligation = await json(restartedBase, `/v1/tasks/${first.taskId}/obligation`, { token: ownerToken });
      const firstObligationId = obligation.body.obligation.id;
      assert.equal(obligation.body.obligation.reward.amount, "0.10");
      const publicTask = await json(restartedBase, `/v1/tasks/${first.taskId}`);
      const publicText = JSON.stringify(publicTask.body);
      assert.equal(publicText.includes(PAYOUT_SECRET), false);
      assert.equal(publicText.includes("payoutDestination"), false);
      assert.equal(publicText.includes("\"budget\""), false);
      assert.equal(publicText.includes(token), false);
      assert.equal(publicText.includes("evidence"), false);

      const second = await createReservedTask(restartedBase, ownerToken, {
        title: "Changed second task",
        summary: "Changed summary. Hypothesis reward 0.20 USDC is not a transfer.",
        reward: REWARD_B,
        budget: REWARD_B,
      });
      assert.notEqual(second.taskId, first.taskId);
      assert.notEqual(second.termsVersion, first.termsVersion);
      const cross = await runOrdinaryContributor({
        baseUrl: restartedBase,
        token,
        taskId: second.taskId,
        mode: "qualify",
      });
      assert.equal(cross.ok, false);
      assert.equal(cross.httpStatus, 403);
      assert.equal(cross.code, "wrong_task_scope");
      assert.equal(cross.submitted, false);
      const wrong = await runOrdinaryContributor({
        baseUrl: restartedBase,
        token: "not-a-real-grant-token",
        taskId: second.taskId,
        mode: "qualify",
      });
      assert.equal(wrong.httpStatus, 401);
      assert.equal(wrong.code, "unauthorized");
      const expiredToken = await issueScoped(
        restartedBase,
        ownerToken,
        second.taskId,
        new Date(Date.now() - 60_000).toISOString(),
      );
      const expired = await runOrdinaryContributor({
        baseUrl: restartedBase,
        token: expiredToken,
        taskId: second.taskId,
        mode: "qualify",
      });
      assert.equal(expired.httpStatus, 401);
      assert.equal(expired.code, "unauthorized");
      assert.equal(expired.submitted, false);
      const reservations = await query(
        `SELECT count(*)::int AS n FROM ${quoteIdent(SCHEMA)}.earned_work_reservations WHERE task_id = $1`,
        [second.taskId],
      );
      assert.equal(reservations[0]?.n, 0);
      const secondToken = await issueScoped(restartedBase, ownerToken, second.taskId);
      const changed = await runOrdinaryContributor({
        baseUrl: restartedBase,
        token: secondToken,
        taskId: second.taskId,
        mode: "submit",
        evidence,
      });
      assert.equal(changed.ok, true, JSON.stringify(changed));
      assert.notEqual(changed.submissionId, submissionId);
      assert.equal(changed.paid, false);
      assert.equal(changed.transfer, null);
      const secondVerdict = await json(restartedBase, `/v1/tasks/${second.taskId}/verdicts`, {
        method: "POST",
        token: ownerToken,
        idempotencyKey: key("verdict2"),
        body: JSON.stringify({ reservationId: changed.reservationId }),
      });
      assert.equal(secondVerdict.status, 201, JSON.stringify(secondVerdict.body));
      const secondAccept = await json(restartedBase, `/v1/tasks/${second.taskId}/accept`, {
        method: "POST",
        token: ownerToken,
        idempotencyKey: key("accept2"),
        body: JSON.stringify({ reservationId: changed.reservationId }),
      });
      assert.equal(secondAccept.status, 201, JSON.stringify(secondAccept.body));
      const secondObligation = await json(restartedBase, `/v1/tasks/${second.taskId}/obligation`, { token: ownerToken });
      assert.notEqual(secondObligation.body.obligation.id, firstObligationId);
      assert.equal(secondObligation.body.obligation.reward.amount, "0.20");
      assert.equal(secondObligation.body.obligation.payoutState, "owed");
      assert.equal(secondObligation.body.obligation.transfer, null);
      const secondPayout = await json(restartedBase, `/v1/tasks/${second.taskId}/payout`, { token: ownerToken });
      assert.equal(secondPayout.body.reconciliation.adapter, "null_nonpaying_v0");
      assert.equal(secondPayout.body.reconciliation.paid, false);
      assert.equal(secondPayout.body.reconciliation.transfer, null);
      const firstAfter = await json(restartedBase, `/v1/tasks/${first.taskId}/obligation`, { token: ownerToken });
      assert.equal(firstAfter.body.obligation.id, firstObligationId);

      const revised = await createReservedTask(restartedBase, ownerToken, {
        title: "Terms revision task",
        summary: "Original terms frozen before the first claim.",
      });
      const revisedToken = await issueScoped(restartedBase, ownerToken, revised.taskId);
      const oldClaim = await runOrdinaryContributor({
        baseUrl: restartedBase,
        token: revisedToken,
        taskId: revised.taskId,
        mode: "qualify",
        claimIdempotencyKey: key("old-claim"),
      });
      assert.equal(oldClaim.ok, true, JSON.stringify(oldClaim));
      const rejected = await json(restartedBase, `/v1/tasks/${revised.taskId}/reject`, {
        method: "POST",
        token: ownerToken,
        idempotencyKey: key("reject"),
        body: JSON.stringify({ reservationId: oldClaim.reservationId, reason: "release before terms change" }),
      });
      assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
      const nextTerms = await json(restartedBase, `/v1/tasks/${revised.taskId}/terms`, {
        method: "POST",
        token: ownerToken,
        idempotencyKey: key("terms"),
        body: JSON.stringify({
          summary: "Revised terms. The previous reservation is not authority.",
          reward: REWARD_A,
        }),
      });
      assert.equal(nextTerms.status, 201, JSON.stringify(nextTerms.body));
      assert.notEqual(nextTerms.body.task.termsVersion, revised.termsVersion);
      const staleSubmit = await json(restartedBase, `/v1/tasks/${revised.taskId}/submissions`, {
        method: "POST",
        token: revisedToken,
        idempotencyKey: key("stale-submit"),
        body: JSON.stringify({
          reservationId: oldClaim.reservationId,
          artifact,
          evidenceBase64: evidence.toString("base64"),
        }),
      });
      assert.equal(staleSubmit.status, 409, JSON.stringify(staleSubmit.body));
      assert.equal(staleSubmit.body.error.code, "terms_changed");
      const staleClaim = await json(restartedBase, `/v1/tasks/${revised.taskId}/claims`, {
        method: "POST",
        token: revisedToken,
        idempotencyKey: key("stale-claim"),
        body: JSON.stringify({ termsVersion: revised.termsVersion }),
      });
      assert.equal(staleClaim.status, 409, JSON.stringify(staleClaim.body));
      assert.equal(staleClaim.body.error.code, "terms_changed");
      const freshClaim = await runOrdinaryContributor({
        baseUrl: restartedBase,
        token: revisedToken,
        taskId: revised.taskId,
        mode: "qualify",
      });
      assert.equal(freshClaim.ok, true, JSON.stringify(freshClaim));
      assert.equal(freshClaim.termsVersion, nextTerms.body.task.termsVersion);
      assert.notEqual(freshClaim.reservationId, oldClaim.reservationId);

      const objective = await runObjectiveTask({ baseUrl: restartedBase, ownerToken });
      assert.equal(objective.termsFrozenBeforeClaim, true);
      assert.equal(objective.naiveVerdict, "accept");
      assert.equal(objective.contractVerdict, "reject");
      assert.equal(objective.contractCodes.includes("forged_settle"), true);
      assert.equal(objective.desiredBusinessOutcomeIsVerifier, false);
      assert.equal(objective.digestMatchesRetrievedArtifact, true);
      assert.equal(objective.paid, false);
      assert.equal(objective.transfer, null);
      assert.equal(objective.cashMoved, false);
      assert.equal(objective.fundedRewardClaim, false);
      assert.equal(objective.publicReachability, false);
      assert.equal(objective.sourceCheckEstablishesPublicReachability, false);
      assert.equal(objective.payoutState, "none");

      await restartedMount.close();
      await restarted.close();

      const disabledApp = appFor({ ...env, EARNED_WORK_MOUNT: "0" });
      const disabledMount = disabledApp.get("earnedWorkMount");
      const disabledServer = await listen(disabledApp);
      try {
        await disabledMount.ready();
        const hostHealth = await json(disabledServer.origin, "/api/health");
        assert.equal(hostHealth.status, 200);
        assert.equal(hostHealth.body.service, "samedaydesk");
        const off = await json(disabledServer.origin, "/api/earned-work/healthz");
        assert.equal(off.status, 200);
        assert.equal(off.body.enabled, false);
        assert.equal(off.body.reason, "unconfigured");
        assert.equal(JSON.stringify(off.body).includes("not deployed"), false);
        const blocked = await json(disabledServer.origin, `/api/earned-work/v1/tasks/${first.taskId}`);
        assert.equal(blocked.status, 503);
        const kept = await query(
          `SELECT id FROM ${quoteIdent(SCHEMA)}.earned_work_obligations WHERE id = $1`,
          [firstObligationId],
        );
        assert.equal(kept[0]?.id, firstObligationId);
        const keptBytes = await query(
          `SELECT octet_length(evidence_bytes)::int AS n FROM ${quoteIdent(SCHEMA)}.earned_work_submissions WHERE id = $1`,
          [submissionId],
        );
        assert.equal(keptBytes[0]?.n, evidence.byteLength);
      } finally {
        await disabledMount.close();
        await disabledServer.close();
      }

      const againApp = appFor(env);
      const againMount = againApp.get("earnedWorkMount");
      const againServer = await listen(againApp);
      try {
        await againMount.ready();
        const again = await json(`${againServer.origin}/api/earned-work`, `/v1/tasks/${first.taskId}`, { token: ownerToken });
        assert.equal(again.status, 200);
        assert.equal(again.body.task.submission.id, submissionId);
        const againBytes = await query(
          `SELECT evidence_bytes FROM ${quoteIdent(SCHEMA)}.earned_work_submissions WHERE id = $1`,
          [submissionId],
        );
        assert.equal(Buffer.compare(againBytes[0].evidence_bytes, evidence), 0);
        await againMount.close();
        const closed = await json(againServer.origin, "/api/earned-work/healthz");
        assert.equal(closed.body.enabled, false);
        assert.equal(closed.body.reason, "disabled");
        const stillThere = await query(
          `SELECT count(*)::int AS n FROM ${quoteIdent(SCHEMA)}.earned_work_submissions WHERE id = $1`,
          [submissionId],
        );
        assert.equal(stillThere[0]?.n, 1);
      } finally {
        await againMount.close().catch(() => {});
        await againServer.close();
      }
    } finally {
      await restartedMount.close().catch(() => {});
      await restarted.close().catch(() => {});
    }
  } finally {
    await mount.close().catch(() => {});
    await server.close().catch(() => {});
    await dropSchema();
  }
});
