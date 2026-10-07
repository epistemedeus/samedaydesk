// Cold public acquisition of the original-task client. No product checkout.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createSdsApp } from "../app.js";
import { PAID_GATEWAY_LINKS } from "../lib/apex-declarations.js";
import { pulseSnapshot } from "../lib/pulse.js";
import { startDisposablePg } from "./fixtures/disposable-pg.mjs";
import {
  acceptPublicArchive,
  buildPublicClient,
  BUNDLED_REL,
  DISCOVERY_REL,
} from "../lib/original-task/public-client.mjs";

const exec = promisify(execFile);
const ROOT = new URL("../../", import.meta.url);
const ADMIN = "original-task-acquisition-token";

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1");
    server.once("error", reject);
    server.once("listening", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function get(url) {
  const response = await fetch(url);
  const bytes = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get("content-type") || "";
  let json = null;
  if (type.includes("json") || type.includes("linkset")) {
    json = JSON.parse(bytes.toString("utf8"));
  }
  return { status: response.status, bytes, type, json, text: bytes.toString("utf8") };
}

function runCold(root, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(root, "server/lib/original-task/cli.mjs"), ...args], {
      cwd: root,
      env: { PATH: process.env.PATH || "", HOME: process.env.HOME || "/tmp", LANG: "C" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

test("public archive is the owning client and a tampered byte is refused", () => {
  const root = fileURL(ROOT);
  const built = buildPublicClient(root);
  const archive = readFileSync(join(root, "client/public/for-agents/original-task/original-task-client.tar.gz"));
  const discovery = JSON.parse(readFileSync(join(root, DISCOVERY_REL), "utf8"));
  assert.equal(createHash("sha256").update(archive).digest("hex"), built.sha256);
  assert.deepEqual(archive, built.archive);
  assert.equal(discovery.acquisition.archive.sha256, built.sha256);
  assert.equal(discovery.acquisition.archive.bytes, built.bytes);
  assert.equal(discovery.acquisition.requiresProductCheckout, false);
  assert.equal(discovery.acquisition.checkoutIsNotAcquisition, true);
  assert.equal(discovery.deliveryPromise, false);
  assert.equal(discovery.payment, false);
  const bundled = JSON.parse(readFileSync(join(root, BUNDLED_REL), "utf8"));
  assert.equal(Object.hasOwn(bundled.acquisition.archive, "sha256"), false);
  assert.deepEqual(bundled, built.bundled);
  for (const rel of built.files) {
    assert.equal(rel.includes("node_modules"), false, rel);
    assert.equal(/collect|operator-http|event-guard|deps\.mjs|store\.mjs|mount\.mjs|\.sql|\.env/.test(rel), false, rel);
    if (rel === BUNDLED_REL) continue;
    assert.deepEqual(built.files && readFileSync(join(root, rel)), readFileSync(join(root, rel)));
  }
  const text = archive.toString("latin1");
  assert.equal(text.includes("require(\"pg\")") || text.includes("require('pg')"), false);
  assert.equal(text.includes("require(\"express\")") || text.includes("require('express')"), false);
  assert.equal(text.includes("postgres://"), false);
  const tampered = Buffer.from(archive);
  tampered[tampered.length - 1] ^= 0x01;
  assert.throws(() => acceptPublicArchive(tampered, discovery), (error) => error.code === "archive_refused");
  assert.equal(acceptPublicArchive(archive, discovery), built.sha256);
});

test("catalog, skill, and card expose the help path without changing paid links", async (t) => {
  const app = createSdsApp();
  const server = await listen(app);
  t.after(() => closeServer(server));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const before = pulseSnapshot();
  const catalog = await get(`${origin}/.well-known/api-catalog`);
  assert.equal(catalog.status, 200);
  const apex = catalog.json.linkset[0];
  const described = apex.describedby.find((link) => link.href.endsWith("/discovery/original-task-correspondence.json"));
  assert.equal(described.type, "application/json");
  const paid = catalog.json.linkset[1];
  assert.deepEqual(
    paid["service-desc"].map((link) => link.href),
    PAID_GATEWAY_LINKS.filter((link) => link.rel === "service-desc").map((link) => link.href),
  );
  const descriptor = await get(`${origin}${new URL(described.href).pathname}`);
  assert.equal(descriptor.status, 200);
  assert.equal(descriptor.json.deliveryPromise, false);
  assert.equal(descriptor.json.acquisition.requiresProductCheckout, false);
  assert.match(descriptor.json.clientCommand, /server\/lib\/original-task\/cli\.mjs describe/);
  const archive = await get(`${origin}${descriptor.json.acquisition.archive.path}`);
  assert.equal(archive.status, 200);
  assert.match(archive.type, /gzip/);
  assert.equal(acceptPublicArchive(archive.bytes, descriptor.json), descriptor.json.acquisition.archive.sha256);
  const card = await get(`${origin}/.well-known/agent-card.json`);
  assert.equal(card.json.interfaces.some((item) => item.url.endsWith("/discovery/original-task-correspondence.json")), true);
  assert.match(card.json.description, /agents\.samedaydesk\.com/);
  const skill = await get(`${origin}/skill.md`);
  assert.match(skill.text, /GET \/discovery\/original-task-correspondence\.json/);
  assert.match(skill.text, /does not submit a task/);
  assert.match(skill.text, /Paid gateway OpenAPI: https:\/\/agents\.samedaydesk\.com\/openapi\.json/);
  const after = pulseSnapshot();
  assert.equal(after.humans, before.humans);
  const payment = await fetch(`${origin}/api/checkout/create-payment-intent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ offer: "original-task" }),
  });
  assert.equal(payment.status, 503);
  const paymentBody = await payment.json();
  assert.equal(paymentBody.error, "Auth not configured");
  assert.equal(JSON.stringify(paymentBody).includes("clientSecret"), false);
});

test("cold archive runs describe, submit, refusal, result, expiry, and a later read", { timeout: 180000 }, async (t) => {
  const pg = await startDisposablePg();
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
      id: "vf10:original-task-acquire",
      maxEnrollments: 8,
      maxEvents: 8,
      grantSeconds: 3600,
      workspaceSeconds: 86400,
    });
    return mounted;
  }
  const app = createSdsApp({
    correspondence: {
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
      hostProfile: { id: "host:original-task-acquire" },
      participationKey: "original-task-acquire-purpose-key",
    },
  });
  const handle = app.get("s51Correspondence");
  await handle.ready();
  assert.equal(handle.state.status, "ready", handle.state.reason);
  const server = await listen(app);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const base = `${origin}/api/correspondence`;
  const work = mkdtempSync(join(tmpdir(), "original-task-acquire-"));
  t.after(async () => {
    await handle.close().catch(() => {});
    await closeServer(server).catch(() => {});
    await pg.stop();
    rmSync(work, { recursive: true, force: true });
  });

  const catalog = await get(`${origin}/.well-known/api-catalog`);
  const described = catalog.json.linkset[0].describedby.find((link) => link.href.includes("original-task-correspondence"));
  const descriptor = await get(`${origin}${new URL(described.href).pathname}`);
  const downloaded = await get(`${origin}${descriptor.json.acquisition.archive.path}`);
  acceptPublicArchive(downloaded.bytes, descriptor.json);
  const root = join(work, "client");
  writeFileSync(join(work, "client.tar.gz"), downloaded.bytes);
  await exec("tar", ["-xzf", join(work, "client.tar.gz"), "-C", work]);
  // tar extracts into work, which also contains client.tar.gz. Move members to a clean root.
  await exec("mkdir", ["-p", root]);
  await exec("tar", ["-xzf", join(work, "client.tar.gz"), "-C", root]);
  assert.equal(existsSync(join(root, "package.json")), false);

  const describedCold = await runCold(root, ["describe"]);
  assert.equal(describedCold.code, 0, describedCold.stderr);
  const coldBody = JSON.parse(describedCold.stdout);
  assert.equal(coldBody.deliveryPromise, false);
  assert.equal(coldBody.acquisition.requiresProductCheckout, false);
  assert.equal(coldBody.exampleConsentDefault, false);
  assert.equal(Object.hasOwn(coldBody.acquisition.archive, "sha256"), false);

  const privateDir = mkdtempSync(join(tmpdir(), "original-task-private-"));
  const badFile = join(privateDir, "bad.json");
  writeFileSync(badFile, JSON.stringify({
    objective: "This must not enroll.",
    publicInput: { kind: "nonsecret_example", example: "visible example" },
    usefulOutput: "No enrollment.",
    friction: "An extra field is not a task.",
    accepted: true,
  }));
  const invalid = await runCold(root, ["submit", "--base-url", base, "--directory", privateDir, "--task-file", badFile]);
  assert.equal(invalid.code, 1);
  assert.equal(JSON.parse(invalid.stderr).error.code, "invalid_task");
  assert.equal(await exists(join(privateDir, "attempt.json")), false);

  const redirect = await listenRaw((res) => {
    res.writeHead(302, { location: "http://127.0.0.1/elsewhere" });
    res.end();
  });
  t.after(() => closeServer(redirect));
  const redirectDir = mkdtempSync(join(tmpdir(), "original-task-redirect-"));
  const redirectFile = join(redirectDir, "task.json");
  writeFileSync(redirectFile, JSON.stringify(task("Refuse a redirect before any attempt.")));
  const redirected = await runCold(root, [
    "submit", "--base-url", `http://127.0.0.1:${redirect.address().port}/api/correspondence`,
    "--directory", redirectDir, "--task-file", redirectFile,
  ]);
  assert.equal(redirected.code, 1);
  assert.equal(JSON.parse(redirected.stderr).error.code, "outcome_unknown");
  assert.equal(await exists(join(redirectDir, "attempt.json")), false);

  const huge = await listenRaw((res) => {
    const body = JSON.stringify({ availability: "available", pad: "x".repeat(40000) });
    res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
    res.end(body);
  });
  t.after(() => closeServer(huge));
  const hugeDir = mkdtempSync(join(tmpdir(), "original-task-bounded-"));
  const hugeFile = join(hugeDir, "task.json");
  writeFileSync(hugeFile, JSON.stringify(task("Refuse an oversized entry response.")));
  const bounded = await runCold(root, [
    "submit", "--base-url", `http://127.0.0.1:${huge.address().port}/api/correspondence`,
    "--directory", hugeDir, "--task-file", hugeFile,
  ]);
  assert.equal(bounded.code, 1);
  assert.equal(JSON.parse(bounded.stderr).error.code, "request_failed");
  assert.equal(await exists(join(hugeDir, "attempt.json")), false);

  const directory = mkdtempSync(join(tmpdir(), "original-task-cold-"));
  const objective = "Cold original task acquired without the website.";
  const taskFile = join(directory, "task.json");
  writeFileSync(taskFile, JSON.stringify(task(objective)));
  const submitted = await runCold(root, ["submit", "--base-url", base, "--directory", directory, "--task-file", taskFile]);
  assert.equal(submitted.code, 0, submitted.stderr);
  const receipt = JSON.parse(submitted.stdout);
  assert.equal(receipt.disposition, "pending_qualification");
  assert.equal(receipt.exampleConsent, false);
  assert.equal(receipt.contributionRequired, false);
  assert.equal(receipt.accepted, false);
  assert.equal(submitted.stdout.includes(objective), false);
  const pending = await runCold(root, ["read", "--directory", directory]);
  assert.equal(JSON.parse(pending.stdout).disposition, "pending_qualification");
  const projectId = JSON.parse(readFileSync(join(directory, "receipt.json"), "utf8")).projectId;
  const listed = await operatorGet(base);
  assert.equal(listed.body.tasks.find((item) => item.projectId === projectId).exampleConsent, false);
  const acquired = await import(pathToFileURL(join(root, "server/lib/original-task/client.mjs")).href);
  await acquired.consentToExample(directory);
  const consented = await operatorGet(base);
  assert.equal(consented.body.tasks.find((item) => item.projectId === projectId).exampleConsent, true);
  assert.equal(consented.body.tasks.find((item) => item.projectId === projectId).contributionRequired ?? false, false);

  const reason = "Cold refusal stays in the private directory.";
  const refusal = await operatorPost(base, projectId, {
    schema: "samedaydesk.original-task-disposition.v1",
    disposition: "useful_refusal",
    reason,
  });
  assert.equal(refusal.status, 201);
  const refused = await runCold(root, ["read", "--directory", directory]);
  assert.equal(refused.code, 0, refused.stderr);
  assert.equal(JSON.parse(refused.stdout).disposition, "useful_refusal");
  assert.equal(refused.stdout.includes(reason), false);
  assert.equal(JSON.parse(readFileSync(join(directory, "retrieval.json"), "utf8")).reason, reason);
  const later = await runCold(root, ["read", "--directory", directory]);
  assert.equal(JSON.parse(later.stdout).disposition, "useful_refusal");
  assert.equal(JSON.parse(readFileSync(join(directory, "retrieval.json"), "utf8")).reason, reason);

  const resultDir = mkdtempSync(join(tmpdir(), "original-task-result-"));
  const resultSentence = "SCOPE_SENTENCE_COLD_ONLY";
  const resultFile = join(resultDir, "task.json");
  writeFileSync(resultFile, JSON.stringify(task("Cold scoped result for the same acquired client.")));
  const resultSubmit = await runCold(root, ["submit", "--base-url", base, "--directory", resultDir, "--task-file", resultFile]);
  assert.equal(resultSubmit.code, 0, resultSubmit.stderr);
  const resultProject = JSON.parse(readFileSync(join(resultDir, "receipt.json"), "utf8")).projectId;
  const scoped = await operatorPost(base, resultProject, {
    schema: "samedaydesk.original-task-disposition.v1",
    disposition: "scoped_result",
    scope: "Cold proof only.",
    result: resultSentence,
  });
  assert.equal(scoped.status, 201);
  const resultRead = await runCold(root, ["read", "--directory", resultDir]);
  assert.equal(JSON.parse(resultRead.stdout).disposition, "scoped_result");
  assert.equal(resultRead.stdout.includes(resultSentence), false);
  assert.equal(JSON.parse(readFileSync(join(resultDir, "retrieval.json"), "utf8")).result, resultSentence);

  const expiredDir = mkdtempSync(join(tmpdir(), "original-task-expire-"));
  const expiredFile = join(expiredDir, "task.json");
  writeFileSync(expiredFile, JSON.stringify(task("Cold grant expiry remains a private read.")));
  const expiredSubmit = await runCold(root, ["submit", "--base-url", base, "--directory", expiredDir, "--task-file", expiredFile]);
  assert.equal(expiredSubmit.code, 0, expiredSubmit.stderr);
  const expiredProject = JSON.parse(readFileSync(join(expiredDir, "receipt.json"), "utf8")).projectId;
  const store = handle.state.store;
  await store.query("UPDATE correspondence_vf10_registrations SET expires_at = clock_timestamp() - interval '1 minute' WHERE project_id = $1", [expiredProject]);
  await store.query("UPDATE correspondence_grants SET expires_at = clock_timestamp() - interval '1 minute' WHERE project_id = $1", [expiredProject]);
  const expired = await runCold(root, ["read", "--directory", expiredDir]);
  assert.equal(expired.code, 0, expired.stderr);
  assert.equal(JSON.parse(expired.stdout).disposition, "expired");
  assert.equal(JSON.parse(readFileSync(join(expiredDir, "retrieval.json"), "utf8")).retrieval, "grant_expired");
});

function fileURL(url) {
  return url.pathname;
}

function task(objective) {
  return {
    objective,
    publicInput: { kind: "nonsecret_example", example: "synthetic public example" },
    usefulOutput: "A private qualification or a useful refusal.",
    friction: "The acquired client must not install the website.",
  };
}

function exists(path) {
  return import("node:fs").then((fs) => fs.existsSync(path));
}

function listenRaw(respond) {
  return new Promise((resolve) => {
    const server = (awaitableHttp()).createServer((_req, res) => respond(res));
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function awaitableHttp() {
  return requireHttp();
}

import http from "node:http";
function requireHttp() { return http; }

async function operatorGet(base) {
  const response = await fetch(`${base}/v1/operator/original-tasks`, { headers: { authorization: `Bearer ${ADMIN}` } });
  return { status: response.status, body: await response.json() };
}

async function operatorPost(base, projectId, body) {
  const response = await fetch(`${base}/v1/operator/original-tasks/${projectId}/disposition`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ADMIN}`,
      "content-type": "application/json",
      "idempotency-key": `acquire-${projectId}-${body.disposition}`,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
