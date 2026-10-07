// Focused proof for original-task help on the existing visitor entry.
// Local only: receiver is null, so register does not call foundry begin.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSdsApp } from "../app.js";
import { startDisposablePg } from "./fixtures/disposable-pg.mjs";
import {
  assertExecutableOrigin,
  discoverEntry,
  postOriginalTask,
  readOriginalTask,
  reconcileOriginalTask,
  registerOriginalTask,
  withdrawOriginalTask,
} from "../lib/original-task/client.mjs";
import { DISPOSITION_SCHEMA, OriginalTaskError, taskRequest } from "../lib/original-task/envelope.mjs";
import { resumedCorrespondence } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/entry/src/client.mjs";

const ADMIN = "original-task-admin-token-24";
const ROOT = new URL("../../", import.meta.url);
const CLI = new URL("../lib/original-task/cli.mjs", import.meta.url);

function listen(app, port = 0) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, "127.0.0.1");
    server.once("error", reject);
    server.once("listening", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function runCli(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI.pathname, ...args], {
      cwd: new URL(".", ROOT).pathname,
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  if (text) body = JSON.parse(text);
  return { status: response.status, body };
}

test("seeded task shapes and unexecuted origins are refused", async () => {
  assert.throws(
    () => taskRequest({
      objective: "Keep the original objective.",
      publicInput: { kind: "nonsecret_example", example: "a public example" },
      usefulOutput: "A scoped note.",
      friction: "None supplied.",
      accepted: true,
    }),
    (error) => error instanceof OriginalTaskError && error.code === "invalid_task",
  );
  assert.throws(
    () => taskRequest({
      objective: "Keep the original objective.",
      publicInput: { kind: "nonsecret_example", example: "a public example" },
      usefulOutput: "A scoped note.",
      friction: "x".repeat(501),
    }),
    (error) => error.code === "oversized_task" && error.status === 413,
  );
  assert.throws(
    () => taskRequest({
      objective: "Bearer abcdefghijklmnop is not a task.",
      publicInput: { kind: "nonsecret_example", example: "public" },
      usefulOutput: "A note.",
      friction: "A credential was pasted.",
    }),
    (error) => error.code === "credential_refused",
  );
  let fetches = 0;
  await assert.rejects(
    () => discoverEntry("https://samedaydesk.com/api/correspondence", {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }),
    (error) => error.code === "origin_refused",
  );
  assert.equal(fetches, 0);
  assert.throws(
    () => assertExecutableOrigin("https://user:secret@samedaydesk.com/api/correspondence", { ownerQa: true }),
    (error) => error.code === "origin_refused",
  );
  assert.equal(assertExecutableOrigin("http://127.0.0.1:9/api/correspondence"), "http://127.0.0.1:9/api/correspondence");
});

test("describe prints the descriptor and does not require a network", async () => {
  const described = await runCli(["describe"]);
  assert.equal(described.code, 0);
  const body = JSON.parse(described.stdout);
  assert.equal(body.schema, "samedaydesk.original-task-correspondence.v1");
  assert.equal(body.thisDescriptorPerformsNoRequest, true);
  assert.equal(body.contributionRequired, false);
  assert.equal(body.defaultDisposition, "pending_qualification");
  assert.equal(body.operator.residentPoller, false);
  const directory = mkdtempSync(join(tmpdir(), "original-task-refused-"));
  chmodSync(directory, 0o700);
  const taskFile = join(directory, "task.json");
  writeFileSync(taskFile, JSON.stringify({
    objective: "This submit must not leave the machine.",
    publicInput: { kind: "https_url", url: "https://samedaydesk.com/api/correspondence/v1/visitor-entry" },
    usefulOutput: "No network call.",
    friction: "Owner QA is not set.",
  }));
  const refused = await runCli([
    "submit",
    "--base-url", "https://127.0.0.1:9/api/correspondence",
    "--directory", directory,
    "--task-file", taskFile,
  ], { ORIGINAL_TASK_OWNER_QA: "0" });
  assert.equal(refused.code, 1);
  assert.equal(JSON.parse(refused.stderr).error.code, "origin_refused");
  assert.equal(readFileSync(taskFile, "utf8").includes("must not leave"), true);
});

test("disabled correspondence keeps operator reading unavailable and serves the descriptor", async (t) => {
  const app = createSdsApp({ correspondence: { env: { NODE_ENV: "test" } } });
  const handle = app.get("s51Correspondence");
  await handle.ready();
  const server = await listen(app);
  t.after(async () => {
    await handle.close();
    await closeServer(server);
  });
  const port = server.address().port;
  const operator = await jsonFetch(`http://127.0.0.1:${port}/api/correspondence/v1/operator/original-tasks`);
  assert.equal(operator.status, 503);
  assert.equal(operator.body.error.code, "unconfigured");
  const descriptor = await jsonFetch(`http://127.0.0.1:${port}/discovery/original-task-correspondence.json`);
  assert.equal(descriptor.status, 200);
  assert.equal(descriptor.body.thisDescriptorPerformsNoRequest, true);
  assert.equal(descriptor.body.operator.requiresEnabledCorrespondence, true);
});

test("entry path receives a task, refusal, withdrawal, expiry, and restart", { timeout: 180000 }, async (t) => {
  const pg = await startDisposablePg();
  const seen = [];
  const hostProfile = { id: "host:original-task-local" };
  const participationKey = "original-task-local-purpose-key-32";
  async function createEntryReuseMount(args) {
    const { createEntryMount } = await import("../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/entry/src/mount.mjs");
    const mounted = createEntryMount({
      enabled: true,
      databaseUrl: args.databaseUrl,
      schema: args.schema,
      correspondence: args.correspondence,
      config: args.config,
      receiver: null,
      poolMax: 2,
    });
    await mounted.entry.migrate();
    await mounted.entry.install({
      id: "vf10:original-task-local",
      maxEnrollments: 8,
      maxEvents: 8,
      grantSeconds: 3600,
      workspaceSeconds: 86400,
    });
    return mounted;
  }
  const correspondence = {
    env: {
      NODE_ENV: "test",
      FOUNDRY_HOST_OPT_IN: "1",
      CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
      CORRESPONDENCE_ADMIN_TOKEN: ADMIN,
      CORRESPONDENCE_DATABASE_URL: pg.url,
      CORRESPONDENCE_POOL_MAX: "2",
      CORRESPONDENCE_STORE: "postgres",
      CORRESPONDENCE_RATE_LIMIT_MAX: "1000",
    },
    loadService: async () => import("@neomorphic/correspondence"),
    createEntryReuseMount,
    hostProfile,
    participationKey,
  };
  async function boot(port = 0) {
    const app = createSdsApp({ correspondence });
    const handle = app.get("s51Correspondence");
    await handle.ready();
    if (handle.state.status !== "ready") {
      throw new Error(`correspondence did not become ready: ${handle.state.reason}`);
    }
    const server = await listen(app, port);
    server.on("request", (req) => { seen.push(req.url); });
    return { app, handle, server, port: server.address().port };
  }
  let current = await boot();
  t.after(async () => {
    if (current) {
      await current.handle.close().catch(() => {});
      await closeServer(current.server).catch(() => {});
    }
    await pg.stop();
  });
  const base = `http://127.0.0.1:${current.port}/api/correspondence`;
  const store = () => current.handle.state.store;

  const entry = await jsonFetch(`${base}/v1/visitor-entry`);
  assert.equal(entry.status, 200);
  assert.equal(entry.body.profile.contributionRequired, false);
  assert.equal(entry.body.profile.identityProofRequired, false);
  assert.equal(entry.body.profile.fundingKind, "voluntary");
  assert.equal(entry.body.profile.sharingAuthorized, false);
  assert.equal(entry.body.availability, "available");
  const decline = await jsonFetch(`${base}/v1/visitor-entry/decline`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(decline.status, 200);
  assert.equal(decline.body.status, "declined");
  assert.equal(decline.body.nextAction, "continue_original");
  const before = await store().query("SELECT count(*)::int AS projects FROM correspondence_projects");
  const chargedBefore = await store().query("SELECT charged FROM correspondence_vf10_installation");
  assert.equal(before.rows[0].projects, 0);
  assert.equal(Number(chargedBefore.rows[0].charged), 0);

  const directory = mkdtempSync(join(tmpdir(), "original-task-a-"));
  chmodSync(directory, 0o700);
  const objective = "Local original task for the entry proof.";
  const task = {
    objective,
    publicInput: { kind: "https_url", url: "https://samedaydesk.com/api/correspondence/v1/visitor-entry" },
    usefulOutput: "A private qualification or a useful refusal.",
    friction: "The operator cannot see this request without the existing admin collection.",
  };
  const taskFile = join(directory, "task.json");
  writeFileSync(taskFile, JSON.stringify(task), { mode: 0o600 });
  const submitted = await runCli([
    "submit", "--base-url", base, "--directory", directory, "--task-file", taskFile,
  ]);
  assert.equal(submitted.code, 0, submitted.stderr);
  const receipt = JSON.parse(submitted.stdout);
  assert.equal(receipt.schema, "samedaydesk.original-task-receipt.v1");
  assert.equal(receipt.stage, "submitted");
  assert.equal(receipt.disposition, "pending_qualification");
  assert.equal(receipt.submitted, true);
  assert.equal(receipt.triaged, false);
  assert.equal(receipt.delivered, false);
  assert.equal(receipt.accepted, false);
  assert.equal(receipt.reused, false);
  assert.equal(receipt.published, false);
  assert.equal(receipt.exampleConsent, false);
  assert.equal(receipt.contributionRequired, false);
  assert.equal(submitted.stdout.includes(objective), false);
  assert.equal(submitted.stdout.includes("prj_"), false);
  const privateReceipt = JSON.parse(readFileSync(join(directory, "receipt.json"), "utf8"));
  assert.equal((statSync(join(directory, "receipt.json")).mode & 0o777), 0o600);
  assert.match(privateReceipt.projectId, /^prj_[\w-]{16}$/);
  const attempt = JSON.parse(readFileSync(join(directory, "attempt.json"), "utf8"));
  assert.deepEqual(Object.keys(attempt.body).sort(), ["profileId", "requestId", "schema", "termsHash"]);
  const charged = async () => Number((await store().query("SELECT charged FROM correspondence_vf10_installation")).rows[0].charged);
  assert.equal(await charged(), 1);
  const reconciled = await reconcileOriginalTask(directory);
  assert.equal(reconciled.status, 200);
  assert.equal(reconciled.body.projectId, privateReceipt.projectId);
  assert.equal(await charged(), 1);
  const replay = await postOriginalTask(directory, task);
  assert.equal(replay.checkpoint.replayed, true);
  assert.equal(await charged(), 1);

  const { consentToExample } = await import("../lib/original-task/client.mjs");
  await consentToExample(directory);
  const pending = await jsonFetch(`${base}/v1/operator/original-tasks`, {
    headers: { authorization: `Bearer ${ADMIN}` },
  });
  assert.equal(pending.status, 200);
  assert.equal(pending.body.schema, "samedaydesk.original-task-collection.v1");
  assert.equal(pending.body.onDemand, true);
  assert.equal(pending.body.residentPoller, false);
  assert.equal(pending.body.tasks.length, 1);
  assert.equal(pending.body.tasks[0].projectId, privateReceipt.projectId);
  assert.equal(pending.body.tasks[0].stage, "submitted");
  assert.equal(pending.body.tasks[0].disposition, "pending_qualification");
  assert.equal(pending.body.tasks[0].exampleConsent, true);
  assert.equal(pending.body.tasks[0].accepted, false);
  assert.equal(pending.body.tasks[0].task.objective, objective);
  const anonymous = await jsonFetch(`${base}/v1/operator/original-tasks`);
  assert.equal(anonymous.status, 401);
  const invented = await jsonFetch(`${base}/v1/operator/original-tasks`, {
    method: "POST",
    headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" },
    body: JSON.stringify({ disposition: "pending_qualification" }),
  });
  assert.equal(invented.status, 405);

  const refusal = {
    schema: DISPOSITION_SCHEMA,
    disposition: "useful_refusal",
    reason: "Local proof only. No hosted execution is authorized for this request.",
  };
  const key = "original-task-refusal-replay-key";
  const firstRefusal = await jsonFetch(`${base}/v1/operator/original-tasks/${privateReceipt.projectId}/disposition`, {
    method: "POST",
    headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify(refusal),
  });
  assert.equal(firstRefusal.status, 201);
  assert.equal(firstRefusal.body.triaged, true);
  assert.equal(firstRefusal.body.delivered, false);
  assert.equal(firstRefusal.body.accepted, false);
  assert.equal(firstRefusal.body.replayed, false);
  const lostReply = await jsonFetch(`${base}/v1/operator/original-tasks/${privateReceipt.projectId}/disposition`, {
    method: "POST",
    headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify(refusal),
  });
  assert.equal(lostReply.status, 200);
  assert.equal(lostReply.body.replayed, true);
  assert.equal(lostReply.body.eventId, firstRefusal.body.eventId);
  const conflict = await jsonFetch(`${base}/v1/operator/original-tasks/${privateReceipt.projectId}/disposition`, {
    method: "POST",
    headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify({ ...refusal, reason: "A different reason must not replace the first reply." }),
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, "idempotency_conflict");
  const second = await jsonFetch(`${base}/v1/operator/original-tasks/${privateReceipt.projectId}/disposition`, {
    method: "POST",
    headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json", "idempotency-key": "original-task-second-disposition" },
    body: JSON.stringify({
      schema: DISPOSITION_SCHEMA,
      disposition: "scoped_result",
      scope: "A second disposition.",
      result: "This must not overwrite the refusal.",
    }),
  });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, "already_disposed");
  const read = await readOriginalTask(directory);
  assert.equal(read.stage, "triaged");
  assert.equal(read.disposition, "useful_refusal");
  assert.equal(read.delivered, true);
  assert.equal(read.accepted, false);
  assert.equal(read.reused, false);
  assert.equal(read.reason, refusal.reason);
  const afterRefusal = await jsonFetch(`${base}/v1/operator/original-tasks`, {
    headers: { authorization: `Bearer ${ADMIN}` },
  });
  assert.equal(afterRefusal.body.tasks.some((item) => item.projectId === privateReceipt.projectId), false);

  const withdrawnDir = mkdtempSync(join(tmpdir(), "original-task-b-"));
  chmodSync(withdrawnDir, 0o700);
  const openedB = await registerOriginalTask(withdrawnDir, base);
  assert.equal(openedB.registration.status, 200);
  await postOriginalTask(withdrawnDir, {
    objective: "Withdraw this local request before qualification.",
    publicInput: { kind: "nonsecret_example", example: "synthetic withdrawal example" },
    usefulOutput: "No result is required.",
    friction: "The requester withdraws the request.",
  });
  assert.equal(await charged(), 2);
  await withdrawOriginalTask(withdrawnDir);
  const projectB = openedB.registration.body.projectId;
  const withdrawnWrite = await jsonFetch(`${base}/v1/operator/original-tasks/${projectB}/disposition`, {
    method: "POST",
    headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json", "idempotency-key": "original-task-withdrawn-block" },
    body: JSON.stringify(refusal),
  });
  assert.equal(withdrawnWrite.status, 409);
  assert.equal(withdrawnWrite.body.error.code, "withdrawn");
  const withWithdrawal = await jsonFetch(`${base}/v1/operator/original-tasks`, {
    headers: { authorization: `Bearer ${ADMIN}` },
  });
  const withdrawnItem = withWithdrawal.body.tasks.find((item) => item.projectId === projectB);
  assert.equal(withdrawnItem.stage, "withdrawn");
  assert.equal(withdrawnItem.accepted, false);
  assert.equal(withdrawnItem.triaged, false);

  const expiredDir = mkdtempSync(join(tmpdir(), "original-task-c-"));
  chmodSync(expiredDir, 0o700);
  const openedC = await registerOriginalTask(expiredDir, base);
  const projectC = openedC.registration.body.projectId;
  await postOriginalTask(expiredDir, {
    objective: "Expire this local workspace.",
    publicInput: { kind: "nonsecret_example", example: "synthetic expiry example" },
    usefulOutput: "No result is required.",
    friction: "The workspace deadline has passed.",
  });
  await store().query(
    "UPDATE correspondence_vf10_registrations SET expires_at = clock_timestamp() - interval '1 minute' WHERE project_id = $1",
    [projectC],
  );
  await store().query(
    "UPDATE correspondence_grants SET expires_at = clock_timestamp() - interval '1 minute' WHERE project_id = $1",
    [projectC],
  );
  const expiredCollection = await jsonFetch(`${base}/v1/operator/original-tasks`, {
    headers: { authorization: `Bearer ${ADMIN}` },
  });
  const expiredItem = expiredCollection.body.tasks.find((item) => item.projectId === projectC);
  assert.equal(expiredItem.stage, "expired");
  assert.equal(expiredItem.disposition, "expired");
  const expiredWrite = await jsonFetch(`${base}/v1/operator/original-tasks/${projectC}/disposition`, {
    method: "POST",
    headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json", "idempotency-key": "original-task-expired-block" },
    body: JSON.stringify(refusal),
  });
  assert.equal(expiredWrite.status, 409);
  assert.equal(expiredWrite.body.error.code, "workspace_expired");
  const expiredReader = resumedCorrespondence(expiredDir, "writer");
  await assert.rejects(
    () => expiredReader.client.postEvent({
      projectId: projectC,
      kind: "correction",
      text: "{\"schema\":\"samedaydesk.original-task-request.v1\",\"disposition\":\"withdrawn\"}",
      idempotencyKey: "expired-writer-must-fail",
    }),
    (error) => error.status === 401,
  );
  expiredReader.client.dispose();

  const malformedDir = mkdtempSync(join(tmpdir(), "original-task-d-"));
  chmodSync(malformedDir, 0o700);
  const openedD = await registerOriginalTask(malformedDir, base);
  const projectD = openedD.registration.body.projectId;
  const malformedWriter = resumedCorrespondence(malformedDir, "writer");
  await malformedWriter.client.postEvent({
    projectId: projectD,
    kind: "request",
    text: "{\"schema\":\"samedaydesk.original-task-request.v1\"}",
    idempotencyKey: "malformed-task-not-listed",
  });
  malformedWriter.client.dispose();
  const listed = await jsonFetch(`${base}/v1/operator/original-tasks`, {
    headers: { authorization: `Bearer ${ADMIN}` },
  });
  assert.equal(listed.body.tasks.some((item) => item.projectId === projectD), false);

  const other = resumedCorrespondence(directory, "reader");
  await assert.rejects(
    () => other.client.listEvents({ projectId: projectB, limit: 10 }),
    (error) => error.status === 404 && error.code === "not_found",
  );
  other.client.dispose();

  const payment = await jsonFetch(`http://127.0.0.1:${current.port}/api/checkout/create-payment-intent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ offer: "original-task" }),
  });
  assert.equal(payment.status, 503);
  assert.equal(payment.body.error, "Auth not configured");
  assert.equal(JSON.stringify(payment.body).includes("clientSecret"), false);

  await current.handle.close();
  await closeServer(current.server);
  current = await boot(current.port);
  const restarted = await jsonFetch(`${base}/v1/operator/original-tasks`, {
    headers: { authorization: `Bearer ${ADMIN}` },
  });
  assert.equal(restarted.status, 200);
  assert.equal(restarted.body.tasks.some((item) => item.projectId === projectB && item.stage === "withdrawn"), true);
  assert.equal(restarted.body.tasks.some((item) => item.projectId === privateReceipt.projectId), false);
  assert.equal(restarted.body.tasks.some((item) => item.projectId === projectC && item.stage === "expired"), true);
  const reread = await readOriginalTask(directory);
  assert.equal(reread.disposition, "useful_refusal");
  assert.equal(reread.delivered, true);
  assert.equal(reread.accepted, false);
  assert.equal(await charged(), 4);
  assert.equal(seen.some((url) => url.includes("/foundry") || url.includes("invoke")), false);
  assert.equal(seen.some((url) => url.includes("/v1/visitor-entry")), true);
});
