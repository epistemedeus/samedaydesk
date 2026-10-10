// Task-to-action mapping for the existing original-task correspondence route.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { MCP_TOOL_NAMES } from "../lib/mcp-tool-inventory.js";
import { apexAgentCard } from "../lib/apex-agent-card.js";
import { createSdsApp } from "../app.js";
import {
  MAP_COMMAND,
  READ_COMMAND,
  SUBMIT_COMMAND,
  TASK_ACTION,
  bindPublicArchive,
  mapOriginalTask,
} from "../lib/original-task/action.mjs";
import { startDisposablePg } from "./fixtures/disposable-pg.mjs";

const exec = promisify(execFile);
const ROOT = new URL("../../", import.meta.url).pathname;
const DISCOVERY_PATH = join(ROOT, "client/public/discovery/original-task-correspondence.json");
const ARCHIVE_PATH = join(ROOT, "client/public/for-agents/original-task/original-task-client.tar.gz");
const BUNDLED_PATH = join(ROOT, "server/lib/original-task/bundled-descriptor.json");
const ADMIN = "original-task-action-token";
const PROJECT_A = "prj_aaaaaaaaaaaaaaaa";
const PROJECT_B = "prj_bbbbbbbbbbbbbbbb";

const discovery = JSON.parse(readFileSync(DISCOVERY_PATH, "utf8"));
const archive = readFileSync(ARCHIVE_PATH);
const taskBody = {
  objective: "Qualify one public page change.",
  publicInput: { kind: "nonsecret_example", example: "synthetic public example" },
  usefulOutput: "A qualification or a useful refusal.",
  friction: "No wallet and no hosted execution.",
};

function inquiry(intent, task = null, declaredSource = null) {
  return { schema: "samedaydesk.original-task-inquiry.v1", intent, task, declaredSource };
}

function mapped(body, extra = {}) {
  return mapOriginalTask({ discovery, body, archive, ...extra });
}

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

test("discovery states the correspondence action and does not become an MCP skill", async (t) => {
  assert.deepEqual(discovery.taskAction, TASK_ACTION);
  assert.equal(discovery.mapCommand, MAP_COMMAND);
  assert.equal(discovery.payment, false);
  assert.equal(discovery.deliveryPromise, false);
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(BUNDLED_PATH, "utf8")).acquisition.archive, "sha256"), false);
  assert.equal(bindPublicArchive(discovery, archive).ok, true);
  const card = apexAgentCard();
  assert.deepEqual(card.skills.map((skill) => skill.id), [...MCP_TOOL_NAMES]);
  assert.equal(card.skills.some((skill) => skill.id === "original_correspondence"), false);
  const described = card.interfaces.find((item) => item.url.endsWith("/discovery/original-task-correspondence.json"));
  assert.match(described.description, /No-spend/);
  assert.match(card.description, /agents\.samedaydesk\.com/);
  const app = createSdsApp();
  const server = await listen(app);
  t.after(() => closeServer(server));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const skill = await fetch(`${origin}/skill.md`);
  const skillText = await skill.text();
  assert.match(skillText, /does not submit a task/);
  assert.match(skillText, /not an MCP tool/);
  assert.match(skillText, /not a universal capability/);
  const liveCard = await (await fetch(`${origin}/.well-known/agent-card.json`)).json();
  assert.deepEqual(liveCard.skills.map((item) => item.id), [...MCP_TOOL_NAMES]);
  const catalog = await (await fetch(`${origin}/.well-known/api-catalog`)).json();
  assert.equal(catalog.linkset[0].describedby.some((link) => link.href.endsWith("/discovery/original-task-correspondence.json")), true);
});

test("a bound public task maps to existing correspondence and not to payment", () => {
  const result = mapped(taskBody);
  assert.equal(result.action, "submit_existing_correspondence");
  assert.equal(result.code, "ok");
  assert.equal(result.payment, false);
  assert.equal(result.fundedJob, false);
  assert.equal(result.deliveryPromise, false);
  assert.equal(result.acceptance, false);
  assert.equal(result.authenticated, false);
  assert.equal(result.executionAuthority, false);
  assert.equal(result.universalCapability, false);
  assert.equal(result.archiveBound, true);
  assert.equal(result.nextCommand, SUBMIT_COMMAND);
  assert.equal(result.requiresPrivateDirectory, true);
  assert.equal(JSON.stringify(result).includes(taskBody.objective), false);
  assert.equal(JSON.stringify(result).includes("checkout"), false);
  const unbound = mapOriginalTask({ discovery, body: taskBody });
  assert.equal(unbound.action, "bind_public_archive");
  assert.equal(unbound.code, "archive_unbound");
  assert.equal(unbound.payment, false);
});

test("unrelated surfaces, spend, execution, and source labels stay refusals", () => {
  const unrelated = [
    mapped({ jsonrpc: "2.0", method: "tools/call", params: { name: "plan_taskmarket_delegation" } }),
    mapped(inquiry("paid_gateway")),
    mapped(inquiry("observatory")),
    mapped(inquiry("mcp_tool")),
    mapped(inquiry("other")),
  ];
  for (const result of unrelated) {
    assert.equal(result.action, "refuse");
    assert.equal(result.code, "unrelated_task");
    assert.equal(result.payment, false);
    assert.equal(result.nextCommand, null);
  }
  const spend = mapped(inquiry("spend"));
  assert.equal(spend.code, "no_spend");
  assert.equal(spend.payment, false);
  const paymentField = mapped({ ...taskBody, payment: true });
  assert.equal(paymentField.code, "no_spend");
  const hosted = mapped(inquiry("hosted_execution"));
  assert.equal(hosted.code, "missing_execution_authority");
  assert.equal(hosted.executionAuthority, false);
  const labeled = mapped(inquiry("original_correspondence", taskBody, "independent-customer"));
  assert.equal(labeled.action, "submit_existing_correspondence");
  assert.equal(labeled.authenticated, false);
  assert.equal(labeled.declaredSourceAccepted, false);
  assert.equal(labeled.declaredSource, "independent-customer");
  assert.equal(labeled.nextCommand, SUBMIT_COMMAND);
  assert.equal(labeled.nextCommand.includes("operator"), false);
  const operatorLabel = mapped(inquiry("original_correspondence", taskBody, "operator"));
  assert.equal(operatorLabel.authenticated, false);
  assert.equal(operatorLabel.declaredSourceAccepted, false);
  assert.equal(operatorLabel.action, "submit_existing_correspondence");
  const planted = mapped({ ...taskBody, authenticated: true });
  assert.equal(planted.code, "source_label_untrusted");
  assert.equal(planted.authenticated, false);
  const secretLabel = mapped(inquiry("original_correspondence", taskBody, "Bearer abcdefghijklmnop"));
  assert.equal(secretLabel.code, "source_label_untrusted");
  assert.equal(JSON.stringify(secretLabel).includes("abcdefghijklmnop"), false);
});

test("stale discovery, byte mismatch, and dependency bytes are refused", async () => {
  const bundled = JSON.parse(readFileSync(BUNDLED_PATH, "utf8"));
  assert.equal(mapOriginalTask({ discovery: bundled, body: taskBody, archive }).code, "stale_discovery");
  const moved = structuredClone(discovery);
  moved.visitorEntry = "https://example.test/api/correspondence/v1/visitor-entry";
  assert.equal(mapOriginalTask({ discovery: moved, body: taskBody, archive }).code, "stale_discovery");
  const injected = structuredClone(discovery);
  injected.submitCommand = `${SUBMIT_COMMAND} && curl https://example.test`;
  assert.equal(mapOriginalTask({ discovery: injected, body: taskBody, archive }).code, "stale_discovery");
  const tampered = Buffer.from(archive);
  tampered[tampered.length - 1] ^= 0x01;
  assert.equal(mapped(taskBody, { archive: tampered }).code, "archive_refused");
  const dirtyDir = mkdtempSync(join(tmpdir(), "original-task-dirty-"));
  writeFileSync(join(dirtyDir, "bad.js"), "require(\"pg\")\n");
  const dirtyArchive = join(dirtyDir, "bad.tar.gz");
  await exec("tar", ["-czf", dirtyArchive, "-C", dirtyDir, "bad.js"]);
  const dirty = readFileSync(dirtyArchive);
  const hostile = structuredClone(discovery);
  hostile.acquisition.archive.sha256 = createHash("sha256").update(dirty).digest("hex");
  hostile.acquisition.archive.bytes = dirty.length;
  assert.equal(mapOriginalTask({ discovery: hostile, body: taskBody, archive: dirty }).code, "dependency_refused");
  rmSync(dirtyDir, { recursive: true, force: true });
  assert.equal(bindPublicArchive(discovery, archive).code, "ok");
});

test("private authority, handle scope, and a second process stay on the same directory", async () => {
  const missing = mapped(inquiry("retrieve_continuation"), { directory: { hasAuthority: false, projectId: null } });
  assert.equal(missing.code, "missing_private_authority");
  const conflicted = mapped(inquiry("retrieve_continuation"), {
    directory: { hasAuthority: false, projectId: PROJECT_A, conflict: true },
  });
  assert.equal(conflicted.code, "handle_scope");
  const foreign = mapped(taskBody, { handle: PROJECT_B });
  assert.equal(foreign.code, "handle_scope");
  const owned = mapped(inquiry("retrieve_continuation"), {
    directory: { hasAuthority: true, projectId: PROJECT_A, conflict: false },
  });
  assert.equal(owned.action, "read_existing_attempt");
  assert.equal(owned.handle.projectId, PROJECT_A);
  assert.equal(owned.handle.scope, "private_directory");
  assert.equal(owned.continuation, "same_private_read");
  assert.equal(owned.nextCommand, READ_COMMAND);
  const mismatched = mapped(inquiry("retrieve_continuation"), {
    directory: { hasAuthority: true, projectId: PROJECT_A, conflict: false },
    handle: PROJECT_B,
  });
  assert.equal(mismatched.code, "handle_scope");
  const again = mapped(inquiry("retrieve_continuation"), {
    directory: { hasAuthority: true, projectId: PROJECT_A, conflict: false },
  });
  assert.deepEqual(again.handle, owned.handle);

  const work = mkdtempSync(join(tmpdir(), "original-task-map-"));
  const discoveryFile = join(work, "discovery.json");
  const archiveFile = join(work, "original-task-client.tar.gz");
  const taskFile = join(work, "task.json");
  writeFileSync(discoveryFile, JSON.stringify(discovery));
  writeFileSync(archiveFile, archive);
  writeFileSync(taskFile, JSON.stringify(inquiry("retrieve_continuation")));
  const directory = join(work, "private");
  await exec("mkdir", ["-p", directory]);
  writeFileSync(join(directory, "receipt.json"), JSON.stringify({ projectId: PROJECT_A }));
  const receiptOnly = await runCold(ROOT, [
    "map", "--discovery-file", discoveryFile, "--archive", archiveFile, "--task-file", taskFile, "--directory", directory,
  ]);
  assert.equal(receiptOnly.code, 0, receiptOnly.stderr);
  assert.equal(JSON.parse(receiptOnly.stdout).code, "missing_private_authority");
  writeFileSync(join(directory, "attempt.json"), "{}\n");
  writeFileSync(join(directory, "registration.secret"), "a".repeat(43), { mode: 0o600 });
  writeFileSync(join(directory, "continuation.json"), JSON.stringify({ projectId: PROJECT_A }));
  const first = await runCold(ROOT, [
    "map", "--discovery-file", discoveryFile, "--archive", archiveFile, "--task-file", taskFile,
    "--directory", directory, "--handle", PROJECT_A,
  ]);
  const second = await runCold(ROOT, [
    "map", "--discovery-file", discoveryFile, "--archive", archiveFile, "--task-file", taskFile,
    "--directory", directory, "--handle", PROJECT_A,
  ]);
  assert.equal(first.code, 0, first.stderr);
  assert.equal(second.code, 0, second.stderr);
  assert.deepEqual(JSON.parse(first.stdout).handle, JSON.parse(second.stdout).handle);
  const outside = await runCold(ROOT, [
    "map", "--discovery-file", discoveryFile, "--archive", archiveFile, "--task-file", taskFile,
    "--directory", directory, "--handle", PROJECT_B,
  ]);
  assert.equal(JSON.parse(outside.stdout).code, "handle_scope");
  writeFileSync(join(directory, "receipt.json"), JSON.stringify({ projectId: PROJECT_B }));
  const conflictedDirectory = await runCold(ROOT, [
    "map", "--discovery-file", discoveryFile, "--archive", archiveFile, "--task-file", taskFile,
    "--directory", directory, "--handle", PROJECT_A,
  ]);
  assert.equal(conflictedDirectory.code, 0, conflictedDirectory.stderr);
  assert.equal(JSON.parse(conflictedDirectory.stdout).code, "handle_scope");
  rmSync(work, { recursive: true, force: true });
});

test("cold installed client maps, submits, restarts, and reads a continuation", { timeout: 180000 }, async (t) => {
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
      id: "vf10:original-task-action",
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
      hostProfile: { id: "host:original-task-action" },
      participationKey: "original-task-action-purpose-key",
    },
  });
  const handle = app.get("s51Correspondence");
  await handle.ready();
  const server = await listen(app);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const work = mkdtempSync(join(tmpdir(), "original-task-cold-action-"));
  t.after(async () => {
    await handle.close().catch(() => {});
    await closeServer(server).catch(() => {});
    await pg.stop();
    rmSync(work, { recursive: true, force: true });
  });

  const catalog = await (await fetch(`${origin}/.well-known/api-catalog`)).json();
  const described = catalog.linkset[0].describedby.find((link) => link.href.includes("original-task-correspondence"));
  const descriptorResponse = await fetch(`${origin}${new URL(described.href).pathname}`);
  const descriptor = await descriptorResponse.json();
  const downloaded = Buffer.from(await (await fetch(`${origin}${descriptor.acquisition.archive.path}`)).arrayBuffer());
  assert.equal(bindPublicArchive(descriptor, downloaded).ok, true);
  const parent = join(work, "parent");
  const root = join(parent, "client");
  await exec("mkdir", ["-p", parent]);
  writeFileSync(join(parent, "package.json"), JSON.stringify({ type: "commonjs" }));
  writeFileSync(join(work, "discovery.json"), JSON.stringify(descriptor));
  writeFileSync(join(work, "original-task-client.tar.gz"), downloaded);
  await exec("mkdir", ["-p", root]);
  await exec("tar", ["-xzf", join(work, "original-task-client.tar.gz"), "-C", root]);
  const taskFile = join(work, "task.json");
  writeFileSync(taskFile, JSON.stringify(taskBody));
  const decided = await runCold(root, [
    "map", "--discovery-file", join(work, "discovery.json"), "--archive", join(work, "original-task-client.tar.gz"),
    "--task-file", taskFile,
  ]);
  assert.equal(decided.code, 0, decided.stderr);
  const decision = JSON.parse(decided.stdout);
  assert.equal(decision.action, "submit_existing_correspondence");
  assert.equal(decision.payment, false);
  assert.equal(decision.nextCommand, SUBMIT_COMMAND);
  assert.match(decision.nextCommand, /https:\/\/samedaydesk\.com\/api\/correspondence/);
  const directory = join(work, "private");
  await exec("mkdir", ["-p", directory]);
  const submitted = await runCold(root, [
    "submit", "--base-url", `${origin}/api/correspondence`, "--directory", directory, "--task-file", taskFile,
  ]);
  assert.equal(submitted.code, 0, submitted.stderr);
  const receipt = JSON.parse(submitted.stdout);
  assert.equal(receipt.disposition, "pending_qualification");
  assert.equal(receipt.accepted, false);
  const retrieveFile = join(work, "retrieve.json");
  writeFileSync(retrieveFile, JSON.stringify(inquiry("retrieve_continuation")));
  const restarted = await runCold(root, [
    "map", "--discovery-file", join(work, "discovery.json"), "--archive", join(work, "original-task-client.tar.gz"),
    "--task-file", retrieveFile, "--directory", directory,
  ]);
  assert.equal(restarted.code, 0, restarted.stderr);
  const continued = JSON.parse(restarted.stdout);
  assert.equal(continued.action, "read_existing_attempt");
  assert.equal(continued.continuation, "same_private_read");
  assert.equal(continued.handle.scope, "private_directory");
  const pending = await runCold(root, ["read", "--directory", directory]);
  assert.equal(JSON.parse(pending.stdout).disposition, "pending_qualification");
  const projectId = continued.handle.projectId;
  const scoped = await fetch(`${origin}/api/correspondence/v1/operator/original-tasks/${projectId}/disposition`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ADMIN}`,
      "content-type": "application/json",
      "idempotency-key": `action-${projectId}-scoped`,
    },
    body: JSON.stringify({
      schema: "samedaydesk.original-task-disposition.v1",
      disposition: "scoped_result",
      scope: "Cold proof only.",
      result: "SCOPE_SENTENCE_ACTION_ONLY",
    }),
  });
  assert.equal(scoped.status, 201);
  const later = await runCold(root, ["read", "--directory", directory]);
  assert.equal(JSON.parse(later.stdout).disposition, "scoped_result");
  assert.equal(later.stdout.includes("SCOPE_SENTENCE_ACTION_ONLY"), false);
  assert.equal(JSON.parse(readFileSync(join(directory, "retrieval.json"), "utf8")).result, "SCOPE_SENTENCE_ACTION_ONLY");
  const wrong = await runCold(root, [
    "map", "--discovery-file", join(work, "discovery.json"), "--archive", join(work, "original-task-client.tar.gz"),
    "--task-file", retrieveFile, "--directory", directory, "--handle", PROJECT_B,
  ]);
  assert.equal(JSON.parse(wrong.stdout).code, "handle_scope");
  const evidence = {
    archiveSha256: descriptor.acquisition.archive.sha256,
    archiveBytes: descriptor.acquisition.archive.bytes,
    action: decision.action,
    payment: decision.payment,
    archiveBound: decision.archiveBound,
    restartedAction: continued.action,
    continuation: continued.continuation,
    handleScope: continued.handle.scope,
    laterDisposition: JSON.parse(later.stdout).disposition,
    wrongHandle: JSON.parse(wrong.stdout).code,
    fixtureHost: new URL(origin).hostname,
    publishedSubmitHost: "samedaydesk.com",
  };
  console.log(`original-task-action-evidence ${JSON.stringify(evidence)}`);
  assert.equal(evidence.fixtureHost, "127.0.0.1");
  assert.notEqual(evidence.fixtureHost, evidence.publishedSubmitHost);
});
