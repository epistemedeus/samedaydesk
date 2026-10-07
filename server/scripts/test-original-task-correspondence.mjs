// Focused proof for original-task help on the existing visitor entry.
// Local only: receiver is null, so register does not call foundry begin.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSdsApp } from "../app.js";
import { startDisposablePg } from "./fixtures/disposable-pg.mjs";
import { collectOriginalTasks, receiveOriginalTasks, writeOriginalTaskDisposition } from "../lib/original-task/collect.mjs";
import {
  assertExecutableOrigin,
  discoverEntry,
  postOriginalTask,
  readOriginalTask,
  reconcileOriginalTask,
  registerOriginalTask,
  withdrawOriginalTask,
} from "../lib/original-task/client.mjs";
import {
  DISPOSITION_SCHEMA,
  OriginalTaskError,
  classifyThread,
  decodeOriginalTaskText,
  dispositionRequest,
  dispositionShape,
  taskRequest,
  withdrawalText,
} from "../lib/original-task/envelope.mjs";
import { hashRequest, hashToken } from "../../vendor/visitor-foundry-receiver/services/correspondence/dist/crypto.js";
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
  assert.equal(
    assertExecutableOrigin("https://samedaydesk.com/api/correspondence"),
    "https://samedaydesk.com/api/correspondence",
  );
  let fetches = 0;
  await assert.rejects(
    () => discoverEntry("https://user:secret@samedaydesk.com/api/correspondence", {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }),
    (error) => error.code === "origin_refused",
  );
  assert.equal(fetches, 0);
  assert.throws(() => assertExecutableOrigin("http://example.com/api/correspondence"), (error) => error.code === "origin_refused");
  assert.throws(() => assertExecutableOrigin("https://samedaydesk.com/api/correspondence?next=1"), (error) => error.code === "origin_refused");
  assert.throws(() => assertExecutableOrigin("https://samedaydesk.com/api/correspondence#next"), (error) => error.code === "origin_refused");
  assert.throws(() => assertExecutableOrigin("not a url"), (error) => error.code === "origin_refused");
  assert.equal(assertExecutableOrigin("http://127.0.0.1:9/api/correspondence"), "http://127.0.0.1:9/api/correspondence");
  const requestText = taskRequest({
    objective: "Keep the original objective.",
    publicInput: { kind: "nonsecret_example", example: "a public example" },
    usefulOutput: "A scoped note.",
    friction: "None supplied.",
  }).text;
  const spacedReply = `{\n  "disposition": "useful_refusal",\n  "reason": "spaced",\n  "schema": ${JSON.stringify(DISPOSITION_SCHEMA)}\n}`;
  assert.equal(dispositionShape(spacedReply), true);
  assert.equal(decodeOriginalTaskText(spacedReply).type, "disposition");
  const storedForgery = classifyThread([
    { kind: "request", text: requestText },
    { kind: "reply", text: spacedReply },
  ]);
  assert.equal(storedForgery.triaged, true);
  assert.equal(storedForgery.disposition, "useful_refusal");
  const looseReply = JSON.stringify({
    schema: DISPOSITION_SCHEMA,
    disposition: "useful_refusal",
    reason: "spaced",
    note: "extra",
  });
  assert.equal(dispositionShape(looseReply), true);
  assert.equal(decodeOriginalTaskText(looseReply).type, "unrecognized");
  const ignoredForgery = classifyThread([
    { kind: "request", text: requestText },
    { kind: "reply", text: looseReply },
  ]);
  assert.equal(ignoredForgery.triaged, false);
  assert.equal(ignoredForgery.disposition, "pending_qualification");

  const redirected = http.createServer((_req, res) => {
    res.writeHead(302, { location: "http://127.0.0.1/elsewhere" });
    res.end();
  });
  await new Promise((resolve) => redirected.listen(0, "127.0.0.1", resolve));
  try {
    await assert.rejects(
      () => discoverEntry(`http://127.0.0.1:${redirected.address().port}/api/correspondence`),
      (error) => error.code === "outcome_unknown",
    );
  } finally {
    await new Promise((resolve) => redirected.close(resolve));
  }
  const mismatched = http.createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      availability: "available",
      profile: {
        profileId: "vf10:mismatch",
        contributionRequired: true,
        identityProofRequired: false,
        fundingKind: "voluntary",
        sharingAuthorized: false,
        termsHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      },
    }));
  });
  await new Promise((resolve) => mismatched.listen(0, "127.0.0.1", resolve));
  try {
    await assert.rejects(
      () => discoverEntry(`http://127.0.0.1:${mismatched.address().port}/api/correspondence`),
      (error) => error.code === "entry_terms_refused",
    );
  } finally {
    await new Promise((resolve) => mismatched.close(resolve));
  }
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
  assert.match(body.submitCommand, /submit --base-url https:\/\/samedaydesk.com\/api\/correspondence/);
  assert.match(body.readCommand, /read --directory/);
  assert.match(body.operator.continuation, /nextCursor/);
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
    "--base-url", "https://user:secret@127.0.0.1:9/api/correspondence",
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
  assert.match(descriptor.body.submitCommand, /submit --base-url https:\/\/samedaydesk.com\/api\/correspondence/);
  assert.match(descriptor.body.readCommand, /read --directory/);
  assert.match(descriptor.body.operator.continuation, /nextCursor/);
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
  const charged = async () => Number((await store().query("SELECT charged FROM correspondence_vf10_installation")).rows[0].charged);
  const registers = () => seen.filter((url) => String(url).includes("/register")).length;
  assert.equal(registers(), 0);
  const invalidDir = mkdtempSync(join(tmpdir(), "original-task-invalid-"));
  chmodSync(invalidDir, 0o700);
  const invalidFile = join(invalidDir, "task.json");
  writeFileSync(invalidFile, JSON.stringify({
    objective: "This must not enroll.",
    publicInput: { kind: "nonsecret_example", example: "public example" },
    usefulOutput: "No enrollment.",
    friction: "accepted is not a request field.",
    accepted: true,
  }));
  const invalidSubmit = await runCli([
    "submit", "--base-url", base, "--directory", invalidDir, "--task-file", invalidFile,
  ]);
  assert.equal(invalidSubmit.code, 1);
  assert.equal(JSON.parse(invalidSubmit.stderr).error.code, "invalid_task");
  assert.equal(await charged(), 0);
  assert.equal(registers(), 0);
  assert.equal(existsSync(join(invalidDir, "attempt.json")), false);

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
  const cold = await runCli(["read", "--directory", directory]);
  assert.equal(cold.code, 0, cold.stderr);
  const coldReceipt = JSON.parse(cold.stdout);
  assert.equal(coldReceipt.stage, "submitted");
  assert.equal(coldReceipt.disposition, "pending_qualification");
  assert.equal(coldReceipt.delivered, false);
  assert.equal(coldReceipt.accepted, false);
  assert.equal(cold.stdout.includes(objective), false);
  assert.equal(cold.stdout.includes("prj_"), false);
  const coldRetrieval = JSON.parse(readFileSync(join(directory, "retrieval.json"), "utf8"));
  assert.equal((statSync(join(directory, "retrieval.json")).mode & 0o777), 0o600);
  assert.equal(coldRetrieval.schema, "samedaydesk.original-task-retrieval.v1");
  assert.equal(coldRetrieval.disposition, "pending_qualification");
  assert.equal(coldRetrieval.accepted, false);
  assert.equal(Object.hasOwn(coldRetrieval, "reason"), false);
  assert.equal(Object.hasOwn(coldRetrieval, "result"), false);
  assert.equal(JSON.stringify(coldRetrieval).includes(objective), false);
  const privateReceipt = JSON.parse(readFileSync(join(directory, "receipt.json"), "utf8"));
  assert.equal((statSync(join(directory, "receipt.json")).mode & 0o777), 0o600);
  assert.match(privateReceipt.projectId, /^prj_[\w-]{16}$/);
  const attempt = JSON.parse(readFileSync(join(directory, "attempt.json"), "utf8"));
  assert.deepEqual(Object.keys(attempt.body).sort(), ["profileId", "requestId", "schema", "termsHash"]);
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

  const canonicalForgery = JSON.stringify({
    schema: DISPOSITION_SCHEMA,
    disposition: "useful_refusal",
    reason: "A writer must not dispose its own request.",
  });
  const spacedForgery = `{\n  "disposition": "scoped_result",\n  "schema": ${JSON.stringify(DISPOSITION_SCHEMA)},\n  "scope": "forged",\n  "result": "forged"\n}\n`;
  const writer = resumedCorrespondence(directory, "writer");
  await assert.rejects(
    () => writer.client.postEvent({
      projectId: privateReceipt.projectId,
      kind: "reply",
      text: canonicalForgery,
      idempotencyKey: "writer-forged-disposition",
    }),
    (error) => error.status === 403 && error.code === "forbidden",
  );
  await assert.rejects(
    () => writer.client.postEvent({
      projectId: privateReceipt.projectId,
      kind: "reply",
      text: spacedForgery,
      idempotencyKey: "writer-spaced-disposition",
    }),
    (error) => error.status === 403 && error.code === "forbidden",
  );
  writer.client.dispose();
  const readerForge = resumedCorrespondence(directory, "reader");
  await assert.rejects(
    () => readerForge.client.postEvent({
      projectId: privateReceipt.projectId,
      kind: "reply",
      text: canonicalForgery,
      idempotencyKey: "reader-forged-disposition",
    }),
    (error) => error.status === 403 && error.code === "forbidden",
  );
  readerForge.client.dispose();
  const repliesBeforeOperator = await store().query(
    "SELECT count(*)::int AS n FROM correspondence_events WHERE project_id = $1 AND kind = 'reply'",
    [privateReceipt.projectId],
  );
  assert.equal(repliesBeforeOperator.rows[0].n, 0);
  const stillPending = await jsonFetch(`${base}/v1/operator/original-tasks`, {
    headers: { authorization: `Bearer ${ADMIN}` },
  });
  assert.equal(stillPending.body.tasks[0].projectId, privateReceipt.projectId);
  assert.equal(stillPending.body.tasks[0].disposition, "pending_qualification");

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
  const refusedRead = await runCli(["read", "--directory", directory]);
  assert.equal(refusedRead.code, 0, refusedRead.stderr);
  const refusedReceipt = JSON.parse(refusedRead.stdout);
  assert.equal(refusedReceipt.disposition, "useful_refusal");
  assert.equal(refusedReceipt.delivered, true);
  assert.equal(refusedReceipt.accepted, false);
  assert.equal(refusedReceipt.reused, false);
  assert.equal(refusedRead.stdout.includes(refusal.reason), false);
  assert.equal(refusedRead.stdout.includes(objective), false);
  const refusedRetrieval = JSON.parse(readFileSync(join(directory, "retrieval.json"), "utf8"));
  assert.equal((statSync(join(directory, "retrieval.json")).mode & 0o777), 0o600);
  assert.equal(refusedRetrieval.reason, refusal.reason);
  assert.equal(refusedRetrieval.delivered, true);
  assert.equal(refusedRetrieval.accepted, false);
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
  const cross = resumedCorrespondence(directory, "writer");
  const crossBefore = await store().query(
    "SELECT count(*)::int AS n FROM correspondence_events WHERE project_id = $1",
    [projectB],
  );
  await assert.rejects(
    () => cross.client.postEvent({
      projectId: projectB,
      kind: "reply",
      text: canonicalForgery,
      idempotencyKey: "cross-project-forged-disposition",
    }),
    (error) => error.status === 404 && error.code === "not_found",
  );
  cross.client.dispose();
  const crossAfter = await store().query(
    "SELECT count(*)::int AS n FROM correspondence_events WHERE project_id = $1",
    [projectB],
  );
  assert.equal(crossAfter.rows[0].n, crossBefore.rows[0].n);

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
  const expiredCli = await runCli(["read", "--directory", expiredDir]);
  assert.equal(expiredCli.code, 0, expiredCli.stderr);
  const expiredBody = JSON.parse(expiredCli.stdout);
  assert.equal(expiredBody.stage, "expired");
  assert.equal(expiredBody.disposition, "expired");
  assert.equal(expiredBody.submitted, false);
  assert.equal(expiredCli.stdout.includes("Expire this local workspace."), false);
  const expiredRetrieval = JSON.parse(readFileSync(join(expiredDir, "retrieval.json"), "utf8"));
  assert.equal((statSync(join(expiredDir, "retrieval.json")).mode & 0o777), 0o600);
  assert.equal(expiredRetrieval.retrieval, "grant_expired");
  assert.equal(JSON.stringify(expiredRetrieval).includes("Expire this local workspace."), false);

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

  const scopedDir = mkdtempSync(join(tmpdir(), "original-task-e-"));
  chmodSync(scopedDir, 0o700);
  const scopedObjective = "Local scoped result for the private reader.";
  const scopedResult = "SCOPE_SENTENCE_LOCAL_ONLY";
  const scopedFile = join(scopedDir, "task.json");
  writeFileSync(scopedFile, JSON.stringify({
    objective: scopedObjective,
    publicInput: { kind: "nonsecret_example", example: "synthetic scoped example" },
    usefulOutput: "A scoped sentence kept in the private directory.",
    friction: "The public receipt must not carry the sentence.",
  }), { mode: 0o600 });
  const scopedSubmit = await runCli([
    "submit", "--base-url", base, "--directory", scopedDir, "--task-file", scopedFile,
  ]);
  assert.equal(scopedSubmit.code, 0, scopedSubmit.stderr);
  assert.equal(scopedSubmit.stdout.includes(scopedObjective), false);
  assert.equal(scopedSubmit.stdout.includes(scopedResult), false);
  const scopedPrivate = JSON.parse(readFileSync(join(scopedDir, "receipt.json"), "utf8"));
  const scopedWrite = await jsonFetch(`${base}/v1/operator/original-tasks/${scopedPrivate.projectId}/disposition`, {
    method: "POST",
    headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json", "idempotency-key": "original-task-scoped-result" },
    body: JSON.stringify({
      schema: DISPOSITION_SCHEMA,
      disposition: "scoped_result",
      scope: "Local proof only.",
      result: scopedResult,
    }),
  });
  assert.equal(scopedWrite.status, 201);
  assert.equal(scopedWrite.body.delivered, false);
  assert.equal(scopedWrite.body.accepted, false);
  const scopedRead = await runCli(["read", "--directory", scopedDir]);
  assert.equal(scopedRead.code, 0, scopedRead.stderr);
  const scopedReceipt = JSON.parse(scopedRead.stdout);
  assert.equal(scopedReceipt.disposition, "scoped_result");
  assert.equal(scopedReceipt.delivered, true);
  assert.equal(scopedReceipt.accepted, false);
  assert.equal(scopedReceipt.reused, false);
  assert.equal(scopedRead.stdout.includes(scopedResult), false);
  assert.equal(scopedRead.stdout.includes(scopedObjective), false);
  assert.equal(scopedRead.stdout.includes("prj_"), false);
  const scopedRetrieval = JSON.parse(readFileSync(join(scopedDir, "retrieval.json"), "utf8"));
  assert.equal((statSync(join(scopedDir, "retrieval.json")).mode & 0o777), 0o600);
  assert.equal(scopedRetrieval.result, scopedResult);
  assert.equal(scopedRetrieval.scope, "Local proof only.");
  assert.equal(scopedRetrieval.delivered, true);
  assert.equal(scopedRetrieval.accepted, false);

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
  const restartedRead = await runCli(["read", "--directory", directory]);
  assert.equal(restartedRead.code, 0, restartedRead.stderr);
  assert.equal(JSON.parse(restartedRead.stdout).disposition, "useful_refusal");
  assert.equal(restartedRead.stdout.includes(refusal.reason), false);
  const restartedRetrieval = JSON.parse(readFileSync(join(directory, "retrieval.json"), "utf8"));
  assert.equal(restartedRetrieval.reason, refusal.reason);
  const restartedScoped = await runCli(["read", "--directory", scopedDir]);
  assert.equal(restartedScoped.code, 0, restartedScoped.stderr);
  assert.equal(JSON.parse(restartedScoped.stdout).disposition, "scoped_result");
  assert.equal(restartedScoped.stdout.includes(scopedResult), false);
  assert.equal(JSON.parse(readFileSync(join(scopedDir, "retrieval.json"), "utf8")).result, scopedResult);
  const restartedExpired = await runCli(["read", "--directory", expiredDir]);
  assert.equal(restartedExpired.code, 0, restartedExpired.stderr);
  assert.equal(JSON.parse(restartedExpired.stdout).stage, "expired");
  assert.equal(JSON.parse(readFileSync(join(expiredDir, "retrieval.json"), "utf8")).retrieval, "grant_expired");
  assert.equal(await charged(), 5);

  const longId = "prj_longthread000001";
  const targetId = "prj_targettask000001";
  const longTask = taskRequest({
    objective: "A withdrawal sits past the event budget.",
    publicInput: { kind: "nonsecret_example", example: "budget example" },
    usefulOutput: "The prefix must not look pending.",
    friction: "Five hundred events hide the withdrawal.",
  });
  const targetTask = taskRequest({
    objective: "A request stranded behind the page boundary.",
    publicInput: { kind: "nonsecret_example", example: "boundary example" },
    usefulOutput: "It is still pending.",
    friction: "The first page is full of other projects.",
  });
  await store().query(
    `INSERT INTO correspondence_projects (
       id, title, summary, status, version, next_action_kind, next_action_url, created_at, updated_at
     ) VALUES ($1, 'long', 'long', 'open', 1, 'reply', NULL, '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z')`,
    [longId],
  );
  await store().query(
    `INSERT INTO correspondence_events (id, project_id, sequence, kind, text, created_at)
     VALUES ('evt_longrequest00001', $1, 1, 'request', $2, '2020-01-01T00:00:00Z')`,
    [longId, longTask.text],
  );
  await store().query(
    `INSERT INTO correspondence_events (id, project_id, sequence, kind, text, created_at)
     SELECT 'evt_longpad' || lpad(g::text, 8, '0'), $1, g, 'correction', '{"pad":true}', '2020-01-01T00:00:01Z'
     FROM generate_series(2, 500) AS g`,
    [longId],
  );
  await store().query(
    `INSERT INTO correspondence_events (id, project_id, sequence, kind, text, created_at)
     VALUES ('evt_longwithdraw0001', $1, 501, 'correction', $2, '2020-01-01T00:00:02Z')`,
    [longId, withdrawalText()],
  );
  await store().query(
    `INSERT INTO correspondence_projects (
       id, title, summary, status, version, next_action_kind, next_action_url, created_at, updated_at
     )
     SELECT 'prj_f' || lpad(g::text, 15, '0'), 'filler', 'filler', 'open', 1, 'reply', NULL,
            '2020-01-02T00:00:00Z'::timestamptz + (g || ' seconds')::interval,
            '2020-01-02T00:00:00Z'::timestamptz + (g || ' seconds')::interval
     FROM generate_series(1, 100) AS g`,
  );
  await store().query(
    `INSERT INTO correspondence_projects (
       id, title, summary, status, version, next_action_kind, next_action_url, created_at, updated_at
     ) VALUES ($1, 'target', 'target', 'open', 1, 'reply', NULL, '2020-01-03T00:00:00Z', '2020-01-03T00:00:00Z')`,
    [targetId],
  );
  await store().query(
    `INSERT INTO correspondence_events (id, project_id, sequence, kind, text, created_at)
     VALUES ('evt_targetrequest001', $1, 1, 'request', $2, '2020-01-03T00:00:00Z')`,
    [targetId, targetTask.text],
  );
  await store().query(
    `INSERT INTO correspondence_grants (
       id, project_id, role, token_hash, expires_at, revoked_at, created_at
     ) VALUES (
       'grn_targetreader0001', $1, 'reader', $2, clock_timestamp() + interval '1 day', NULL, clock_timestamp()
     )`,
    [targetId, createHash("sha256").update("target-reader-local").digest("hex")],
  );
  const prefixRows = await store().query(
    "SELECT kind, text FROM correspondence_events WHERE project_id = $1 AND sequence <= 500 ORDER BY sequence",
    [longId],
  );
  const prefixView = classifyThread(prefixRows.rows);
  assert.equal(prefixView.disposition, "pending_qualification");
  assert.equal(prefixView.triaged, false);
  const firstPage = await collectOriginalTasks(store());
  assert.equal(firstPage.complete, false);
  assert.equal(firstPage.truncated, true);
  assert.equal(typeof firstPage.nextCursor, "string");
  assert.equal(firstPage.tasks.some((item) => item.projectId === longId), false);
  assert.equal(firstPage.tasks.some((item) => item.projectId === targetId), false);
  assert.equal(firstPage.tasks.some((item) => item.disposition === "pending_qualification"), false);
  const followed = await collectOriginalTasks(store(), { cursor: firstPage.nextCursor });
  assert.equal(followed.tasks.find((item) => item.projectId === longId)?.disposition, "withdrawn");
  const received = await receiveOriginalTasks(store());
  assert.equal(received.complete, true);
  assert.equal(received.nextCursor, null);
  assert.equal(received.tasks.find((item) => item.projectId === longId)?.disposition, "withdrawn");
  const targetItem = received.tasks.find((item) => item.projectId === targetId);
  assert.equal(targetItem.stage, "submitted");
  assert.equal(targetItem.disposition, "pending_qualification");
  assert.equal(targetItem.accepted, false);
  const badCursor = await jsonFetch(`${base}/v1/operator/original-tasks?after=not-a-cursor`, {
    headers: { authorization: `Bearer ${ADMIN}` },
  });
  assert.equal(badCursor.status, 400);
  assert.equal(badCursor.body.error.code, "invalid_cursor");
  const operatorAll = await jsonFetch(`${base}/v1/operator/original-tasks`, {
    headers: { authorization: `Bearer ${ADMIN}` },
  });
  assert.equal(operatorAll.status, 200);
  assert.equal(operatorAll.body.complete, true);
  assert.equal(operatorAll.body.tasks.find((item) => item.projectId === targetId)?.disposition, "pending_qualification");
  assert.equal(operatorAll.body.tasks.find((item) => item.projectId === longId)?.disposition, "withdrawn");
  const operatorContinued = await jsonFetch(
    `${base}/v1/operator/original-tasks?after=${encodeURIComponent(firstPage.nextCursor)}`,
    { headers: { authorization: `Bearer ${ADMIN}` } },
  );
  assert.equal(operatorContinued.status, 200);
  assert.equal(operatorContinued.body.complete, true);
  assert.equal(operatorContinued.body.tasks.find((item) => item.projectId === targetId)?.disposition, "pending_qualification");

  async function openRaceProject(label) {
    const token = randomBytes(32).toString("base64url");
    const body = { title: label, summary: "local race fixture" };
    const created = await store().createProject({
      title: body.title,
      summary: body.summary,
      ownerTokenHash: hashToken(token),
      ownerTokenPlainForReplay: token,
      idempotencyKey: `race-project-${label}`,
      requestHash: hashRequest(body),
    });
    const text = taskRequest({
      objective: `Race fixture ${label}.`,
      publicInput: { kind: "nonsecret_example", example: "race example" },
      usefulOutput: "One authoritative reply.",
      friction: "Two writers must not both land.",
    }).text;
    await store().createEvent({
      projectId: created.project.id,
      kind: "request",
      text,
      idempotencyKey: `race-request-${label}`,
      requestHash: hashRequest({ kind: "request", text }),
    });
    await store().createGrant({
      projectId: created.project.id,
      role: "reader",
      tokenHash: hashToken(randomBytes(32).toString("base64url")),
      expiresAt: null,
    });
    return { projectId: created.project.id, ownerToken: token };
  }
  const versionProject = await openRaceProject("version");
  const versionBody = {
    schema: DISPOSITION_SCHEMA,
    disposition: "useful_refusal",
    reason: "A changed version must not be overwritten.",
  };
  await assert.rejects(
    () => writeOriginalTaskDisposition(store(), {
      projectId: versionProject.projectId,
      body: versionBody,
      idempotencyKey: "version-conflict-key",
      beforeAppend: async () => {
        await store().query(
          "UPDATE correspondence_projects SET version = version + 1 WHERE id = $1",
          [versionProject.projectId],
        );
      },
    }),
    (error) => error instanceof OriginalTaskError && error.code === "version_conflict" && error.status === 409,
  );
  const versionReplies = await store().query(
    "SELECT count(*)::int AS n FROM correspondence_events WHERE project_id = $1 AND kind = 'reply'",
    [versionProject.projectId],
  );
  assert.equal(versionReplies.rows[0].n, 0);

  const withdrawProject = await openRaceProject("withdraw");
  await assert.rejects(
    () => writeOriginalTaskDisposition(store(), {
      projectId: withdrawProject.projectId,
      body: {
        schema: DISPOSITION_SCHEMA,
        disposition: "useful_refusal",
        reason: "A racing withdrawal must win.",
      },
      idempotencyKey: "racing-withdrawal-disposition",
      beforeAppend: async () => {
        const text = withdrawalText();
        await store().createEvent({
          projectId: withdrawProject.projectId,
          kind: "correction",
          text,
          idempotencyKey: "racing-withdrawal-event",
          requestHash: hashRequest({ kind: "correction", text }),
        });
      },
    }),
    (error) => error instanceof OriginalTaskError && error.code === "withdrawn" && error.status === 409,
  );
  const withdrawReplies = await store().query(
    "SELECT count(*)::int AS n FROM correspondence_events WHERE project_id = $1 AND kind = 'reply'",
    [withdrawProject.projectId],
  );
  assert.equal(withdrawReplies.rows[0].n, 0);

  const raceProject = await openRaceProject("parallel");
  const settled = await Promise.allSettled([
    writeOriginalTaskDisposition(store(), {
      projectId: raceProject.projectId,
      body: {
        schema: DISPOSITION_SCHEMA,
        disposition: "useful_refusal",
        reason: "First parallel reply.",
      },
      idempotencyKey: "race-key-alpha-01",
    }),
    writeOriginalTaskDisposition(store(), {
      projectId: raceProject.projectId,
      body: {
        schema: DISPOSITION_SCHEMA,
        disposition: "useful_refusal",
        reason: "Second parallel reply.",
      },
      idempotencyKey: "race-key-beta-02",
    }),
  ]);
  const fulfilled = settled.filter((item) => item.status === "fulfilled");
  const rejected = settled.filter((item) => item.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(fulfilled[0].value.replayed, false);
  assert.equal(rejected[0].reason.code, "already_disposed");
  assert.equal(rejected[0].reason.status, 409);
  const raceReplies = await store().query(
    "SELECT count(*)::int AS n FROM correspondence_events WHERE project_id = $1 AND kind = 'reply'",
    [raceProject.projectId],
  );
  assert.equal(raceReplies.rows[0].n, 1);
  const winningKey = settled[0].status === "fulfilled" ? "race-key-alpha-01" : "race-key-beta-02";
  const winningReason = settled[0].status === "fulfilled" ? "First parallel reply." : "Second parallel reply.";
  const sameKey = await writeOriginalTaskDisposition(store(), {
    projectId: raceProject.projectId,
    body: {
      schema: DISPOSITION_SCHEMA,
      disposition: "useful_refusal",
      reason: winningReason,
    },
    idempotencyKey: winningKey,
  });
  assert.equal(sameKey.replayed, true);
  assert.equal(sameKey.eventId, fulfilled[0].value.eventId);
  const afterReplay = await store().query(
    "SELECT count(*)::int AS n FROM correspondence_events WHERE project_id = $1 AND kind = 'reply'",
    [raceProject.projectId],
  );
  assert.equal(afterReplay.rows[0].n, 1);

  const ownerProject = await openRaceProject("owner");
  const writerToken = randomBytes(32).toString("base64url");
  await store().createGrant({
    projectId: ownerProject.projectId,
    role: "writer",
    tokenHash: hashToken(writerToken),
    expiresAt: null,
  });
  const ownerText = dispositionRequest({
    schema: DISPOSITION_SCHEMA,
    disposition: "useful_refusal",
    reason: "The owner grant may still reply on the ordinary event route.",
  }).text;
  const writerBlocked = await jsonFetch(`${base}/v1/projects/${ownerProject.projectId}/events`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${writerToken}`,
      "content-type": "application/json",
      "idempotency-key": "owner-project-writer-block",
    },
    body: JSON.stringify({ kind: "reply", text: ownerText }),
  });
  assert.equal(writerBlocked.status, 403);
  assert.equal(writerBlocked.body.error.code, "forbidden");
  const ownerAllowed = await jsonFetch(`${base}/v1/projects/${ownerProject.projectId}/events`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ownerProject.ownerToken}`,
      "content-type": "application/json",
      "idempotency-key": "owner-project-owner-reply",
    },
    body: JSON.stringify({ kind: "reply", text: ownerText }),
  });
  assert.equal(ownerAllowed.status, 201);
  const ownerEvents = await store().listEvents({ projectId: ownerProject.projectId, afterSequence: 0, limit: 10 });
  assert.equal(classifyThread(ownerEvents.events).disposition, "useful_refusal");

  assert.equal(seen.some((url) => url.includes("/foundry") || url.includes("invoke")), false);
  assert.equal(seen.some((url) => url.includes("/v1/visitor-entry")), true);
});
