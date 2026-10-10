// Owner QA for the original-task qualification skill. These fixtures are not demand.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createSdsApp } from "../server/app.js";
import { startDisposablePg } from "../server/scripts/fixtures/disposable-pg.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const SKILL = join(ROOT, "distribution/original-task-qualification");
const DISCOVERY_PATH = join(ROOT, "client/public/discovery/original-task-correspondence.json");
const ARCHIVE_PATH = join(ROOT, "client/public/for-agents/original-task/original-task-client.tar.gz");
const PINS_PATH = join(SKILL, "references/pins.json");
const OBSERVATIONS = [
  "acquisition",
  "encounter",
  "install",
  "registration",
  "submission",
  "disposition",
  "delivery",
  "acceptance",
  "payment",
  "repeatUse",
];
const TASK = {
  objective: "Qualify one public page change.",
  publicInput: { kind: "nonsecret_example", example: "synthetic public example" },
  usefulOutput: "A qualification or a useful refusal.",
  friction: "No wallet and no hosted execution.",
};
const ADMIN = "original-task-distribution-token";

function inquiry(intent, task = null) {
  return { schema: "samedaydesk.original-task-inquiry.v1", intent, task, declaredSource: null };
}

function listen(source) {
  return new Promise((resolve, reject) => {
    const server = source.listen(0, "127.0.0.1");
    server.once("error", reject);
    server.once("listening", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function runSkill(script, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: tmpdir(),
      env: {
        PATH: process.env.PATH || "",
        HOME: process.env.HOME || "",
        TMPDIR: process.env.TMPDIR || tmpdir(),
        LANG: "C.UTF-8",
        CORRESPONDENCE_ADMIN_TOKEN: "should-not-pass",
        SECRET_LEAK: "should-not-pass",
        ...env,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

function classified(ran) {
  assert.equal(ran.stderr, "");
  const lines = ran.stdout.trim().split("\n");
  assert.equal(lines.length, 1);
  const body = JSON.parse(lines[0]);
  assert.equal(body.schema, "samedaydesk.original-task-qualification-skill.v1");
  for (const key of OBSERVATIONS) assert.equal(Object.hasOwn(body, key), true);
  assert.equal(ran.stdout.includes("should-not-pass"), false);
  assert.equal(ran.stdout.includes("Bearer CORRESPONDENCE_ADMIN_TOKEN"), false);
  return body;
}

function installSkill(work) {
  const installed = join(work, "installed", "original-task-qualification");
  cpSync(SKILL, installed, { recursive: true });
  return join(installed, "scripts/cli.mjs");
}

function snapshot(dir) {
  if (!existsSync(dir)) return null;
  const rows = [];
  const walk = (current, prefix) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const info = lstatSync(full);
      if (info.isSymbolicLink()) rows.push([rel, "link", readlinkSync(full)]);
      else if (info.isDirectory()) {
        rows.push([rel, "dir"]);
        walk(full, rel);
      } else {
        rows.push([rel, "file", createHash("sha256").update(readFileSync(full)).digest("hex"), info.size]);
      }
    }
  };
  walk(dir, "");
  return JSON.stringify(rows);
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

function publishedDiscovery(origin, mutate = (copy) => copy) {
  const copy = structuredClone(JSON.parse(readFileSync(DISCOVERY_PATH, "utf8")));
  copy.acquisition.archive.url = `${origin}/for-agents/original-task/original-task-client.tar.gz`;
  return JSON.stringify(mutate(copy));
}

async function contentServer({ discovery, archive = null, status = 200, redirect = false }) {
  const counts = { discovery: 0, archive: 0, other: 0, post: 0 };
  let origin = "";
  const server = http.createServer((req, res) => {
    if (req.method === "POST") counts.post += 1;
    if (redirect) {
      counts.other += 1;
      res.writeHead(302, { location: "https://example.invalid/elsewhere" });
      res.end();
      return;
    }
    if (req.url === "/discovery/original-task-correspondence.json") {
      counts.discovery += 1;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(status === 200 ? discovery(origin) : "");
      return;
    }
    if (req.url === "/for-agents/original-task/original-task-client.tar.gz") {
      counts.archive += 1;
      res.writeHead(200, { "content-type": "application/gzip" });
      res.end(archive);
      return;
    }
    counts.other += 1;
    res.writeHead(404);
    res.end();
  });
  const listening = await listen(server);
  origin = `http://127.0.0.1:${listening.address().port}`;
  return {
    server: listening,
    origin,
    counts,
    discoveryUrl: `${origin}/discovery/original-task-correspondence.json`,
  };
}

test("pins match the published archive and the skill names that archive", () => {
  const pins = JSON.parse(readFileSync(PINS_PATH, "utf8"));
  const bytes = readFileSync(ARCHIVE_PATH);
  assert.equal(pins.archive.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(pins.archive.bytes, bytes.length);
  assert.equal(bytes.length, 23811);
  const skill = readFileSync(join(SKILL, "SKILL.md"), "utf8");
  assert.match(skill, /^name: original-task-qualification$/m);
  assert.match(skill, /not delivery, acceptance, or payment/);
  assert.match(skill, /existing unrelated directory is refused/);
  assert.match(skill, /local continuation retrieval/);
  assert.equal(skill.includes("\u2014"), false);
  assert.doesNotMatch(readFileSync(join(SKILL, "scripts/cli.mjs"), "utf8"), /child_process\.(exec|spawn|fork)\s*\(/);
});

test("cold install acquires, maps, and refuses the unsupported cases", { timeout: 60000 }, async (t) => {
  const work = mkdtempSync(join(tmpdir(), "original-task-skill-"));
  const script = installSkill(work);
  const archive = readFileSync(ARCHIVE_PATH);
  t.after(() => rmSync(work, { recursive: true, force: true }));

  const payment = await contentServer({ discovery: (origin) => publishedDiscovery(origin), archive });
  t.after(() => closeServer(payment.server));
  const paymentRun = await runSkill(script, [
    "acquire", "--cache", join(work, "pay-cache"), "--discovery-url", payment.discoveryUrl, "--pay",
  ]);
  const paymentBody = classified(paymentRun);
  assert.equal(paymentRun.code, 1);
  assert.equal(paymentBody.error.code, "payment_refused");
  assert.equal(payment.counts.discovery, 0);
  assert.equal(payment.counts.post, 0);

  const missing = await contentServer({ discovery: () => "", status: 404 });
  t.after(() => closeServer(missing.server));
  const missingRun = await runSkill(script, [
    "acquire", "--cache", join(work, "missing-cache"), "--discovery-url", missing.discoveryUrl, "--timeout-ms", "5000",
  ]);
  assert.equal(missingRun.code, 1);
  assert.equal(classified(missingRun).error.code, "descriptor_unavailable");

  const redirected = await contentServer({ discovery: (origin) => publishedDiscovery(origin), redirect: true });
  t.after(() => closeServer(redirected.server));
  const redirectedRun = await runSkill(script, [
    "acquire", "--cache", join(work, "redirect-cache"), "--discovery-url", redirected.discoveryUrl, "--timeout-ms", "5000",
  ]);
  assert.equal(classified(redirectedRun).error.code, "redirect_refused");
  assert.equal(redirected.counts.post, 0);

  const staleHash = await contentServer({
    discovery: (origin) => publishedDiscovery(origin, (copy) => {
      copy.acquisition.archive.sha256 = "a".repeat(64);
      return copy;
    }),
    archive,
  });
  t.after(() => closeServer(staleHash.server));
  const staleHashRun = await runSkill(script, [
    "acquire", "--cache", join(work, "stale-hash-cache"), "--discovery-url", staleHash.discoveryUrl,
  ]);
  const staleHashBody = classified(staleHashRun);
  assert.equal(staleHashBody.error.code, "stale_discovery");
  assert.equal(staleHashBody.acquisition.matched, false);
  assert.equal(staleHash.counts.archive, 0);
  assert.equal(existsSync(join(work, "stale-hash-cache", "client")), false);

  const wrong = await contentServer({
    discovery: (origin) => publishedDiscovery(origin),
    archive: Buffer.from("wrong-archive"),
  });
  t.after(() => closeServer(wrong.server));
  const wrongRun = await runSkill(script, [
    "acquire", "--cache", join(work, "wrong-cache"), "--discovery-url", wrong.discoveryUrl,
  ]);
  const wrongBody = classified(wrongRun);
  assert.equal(wrongBody.error.code, "archive_refused");
  assert.equal(wrongBody.acquisition.matched, false);
  assert.equal(existsSync(join(work, "wrong-cache", "client")), false);

  const good = await contentServer({ discovery: (origin) => publishedDiscovery(origin), archive });
  t.after(() => closeServer(good.server));
  const cache = join(work, "good-cache");
  const acquired = classified(await runSkill(script, [
    "acquire", "--cache", cache, "--discovery-url", good.discoveryUrl,
  ]));
  assert.equal(acquired.error, null);
  assert.equal(acquired.acquisition.matched, true);
  assert.equal(acquired.acquisition.sha256, JSON.parse(readFileSync(PINS_PATH, "utf8")).archive.sha256);
  assert.equal(acquired.acquisition.fetched, true);
  assert.equal(acquired.install.clientExtracted, true);
  assert.equal(acquired.encounter.schema, "samedaydesk.original-task-correspondence.v1");
  assert.equal(acquired.submission, null);
  assert.equal(acquired.repeatUse, null);
  assert.equal(good.counts.post, 0);

  const described = classified(await runSkill(script, ["describe", "--cache", cache]));
  assert.equal(described.result.schema, "samedaydesk.original-task-correspondence.v1");
  assert.equal(described.result.deliveryPromise, false);
  assert.equal(described.result.acceptance, false);
  assert.equal(described.result.thisDescriptorPerformsNoRequest, true);
  assert.equal(described.result.operator.authorization, undefined);
  assert.match(described.result.operator.credentialLocator, /CORRESPONDENCE_ADMIN_TOKEN/);
  assert.equal(described.payment.payment, false);
  assert.equal(described.delivery.promised, false);
  assert.equal(described.acceptance.accepted, false);
  assert.equal(described.acquisition.fetched, false);
  assert.equal(good.counts.discovery, 1);

  const taskFile = join(work, "task.json");
  writeFileSync(taskFile, JSON.stringify(TASK));
  const mapped = classified(await runSkill(script, ["map", "--cache", cache, "--task-file", taskFile]));
  assert.equal(mapped.result.action, "submit_existing_correspondence");
  assert.equal(mapped.result.code, "ok");
  assert.equal(mapped.result.payment, false);
  assert.equal(mapped.result.deliveryPromise, false);
  assert.equal(mapped.result.acceptance, false);
  assert.equal(mapped.disposition.code, "ok");
  assert.equal(mapped.submission, null);
  assert.equal(mapped.payment.payment, false);
  assert.equal(mapped.delivery.promised, false);
  assert.equal(mapped.acceptance.accepted, false);
  assert.equal(mapped.repeatUse, null);
  assert.equal(existsSync(join(cache, "registration.secret")), false);

  const unrelatedFile = join(work, "unrelated.json");
  writeFileSync(unrelatedFile, JSON.stringify({ jsonrpc: "2.0", method: "tools/call" }));
  const unrelated = classified(await runSkill(script, ["map", "--cache", cache, "--task-file", unrelatedFile]));
  assert.equal(unrelated.result.action, "refuse");
  assert.equal(unrelated.result.code, "unrelated_task");
  assert.equal(unrelated.submission, null);

  const spendFile = join(work, "spend.json");
  writeFileSync(spendFile, JSON.stringify(inquiry("spend")));
  const spend = classified(await runSkill(script, ["map", "--cache", cache, "--task-file", spendFile]));
  assert.equal(spend.result.code, "no_spend");
  assert.equal(spend.payment.payment, false);
  assert.equal(spend.submission, null);

  const retrieveFile = join(work, "retrieve.json");
  writeFileSync(retrieveFile, JSON.stringify(inquiry("retrieve_continuation")));
  const missingPrivate = classified(await runSkill(script, ["map", "--cache", cache, "--task-file", retrieveFile]));
  assert.equal(missingPrivate.result.code, "missing_private_authority");
  assert.equal(missingPrivate.registration, null);

  const realPrivate = join(work, "real-private");
  mkdirSync(realPrivate, { mode: 0o700 });
  writeFileSync(join(realPrivate, "attempt.json"), "{}\n");
  writeFileSync(join(realPrivate, "registration.secret"), `${"c".repeat(43)}\n`, { mode: 0o600 });
  writeFileSync(join(realPrivate, "continuation.json"), `${JSON.stringify({ projectId: "prj_aaaaaaaaaaaaaaaa" })}\n`);
  const linked = join(work, "linked-private");
  symlinkSync(realPrivate, linked);
  const linkedMap = classified(await runSkill(script, [
    "map", "--cache", cache, "--task-file", retrieveFile, "--directory", linked,
  ]));
  assert.equal(linkedMap.result.code, "missing_private_authority");
  assert.equal(JSON.stringify(linkedMap).includes("prj_aaaaaaaaaaaaaaaa"), false);

  const promising = await contentServer({
    discovery: (origin) => publishedDiscovery(origin, (copy) => {
      copy.deliveryPromise = true;
      return copy;
    }),
    archive,
  });
  t.after(() => closeServer(promising.server));
  const promisingCache = join(work, "promise-cache");
  const promisingRun = await runSkill(script, [
    "map", "--cache", promisingCache, "--discovery-url", promising.discoveryUrl, "--task-file", taskFile,
  ]);
  const promisingBody = classified(promisingRun);
  assert.equal(promisingBody.result.action, "refuse");
  assert.equal(promisingBody.result.code, "stale_discovery");
  assert.equal(promisingBody.result.deliveryPromise, false);
  assert.equal(promisingBody.submission, null);
  assert.equal(JSON.parse(readFileSync(join(promisingCache, "discovery.json"), "utf8")).deliveryPromise, true);

  const counter = await contentServer({ discovery: (origin) => publishedDiscovery(origin), archive });
  t.after(() => closeServer(counter.server));
  const privateDir = join(work, "not-submitted");
  mkdirSync(privateDir, { mode: 0o700 });
  const unconfirmed = classified(await runSkill(script, [
    "submit", "--cache", join(work, "unconfirmed-cache"), "--discovery-url", counter.discoveryUrl,
    "--base-url", `${counter.origin}/api/correspondence`, "--directory", privateDir, "--task-file", taskFile,
  ]));
  assert.equal(unconfirmed.error.code, "submission_required");
  assert.equal(counter.counts.discovery, 0);
  assert.equal(counter.counts.post, 0);
  assert.equal(existsSync(join(privateDir, "registration.secret")), false);

  const foreign = classified(await runSkill(script, [
    "submit", "--cache", cache, "--base-url", "https://example.invalid/api/correspondence",
    "--directory", privateDir, "--task-file", taskFile, "--submit", "yes",
  ]));
  assert.equal(foreign.error.code, "origin_refused");
  assert.equal(good.counts.post, 0);

  const inside = join(work, "installed/original-task-qualification/nested-cache");
  mkdirSync(inside);
  const nested = classified(await runSkill(script, [
    "acquire", "--cache", inside, "--discovery-url", good.discoveryUrl,
  ]));
  assert.equal(nested.error.code, "cache_refused");
  assert.deepEqual(readdirSync(inside), []);

  const emptyPrivate = join(work, "empty-private");
  mkdirSync(emptyPrivate, { mode: 0o700 });
  const unread = await runSkill(script, ["read", "--cache", cache, "--directory", emptyPrivate]);
  const unreadBody = classified(unread);
  assert.equal(unread.code, 1);
  assert.equal(unreadBody.result, null);
  assert.equal(unreadBody.registration.code, "absent");
  assert.equal(unreadBody.repeatUse, null);
  assert.equal(good.counts.discovery, 1);
});

test("fixture relative paths submit restart and read without treating qualification as acceptance", { timeout: 180000 }, async (t) => {
  const work = mkdtempSync(join(tmpdir(), "original-task-skill-submit-"));
  const script = installSkill(work);
  const archive = readFileSync(ARCHIVE_PATH);
  const source = await contentServer({ discovery: (origin) => publishedDiscovery(origin), archive });
  const pg = await startDisposablePg();
  async function createEntryReuseMount(args) {
    const { createEntryMount } = await import("../vendor/visitor-foundry-receiver/scripts/visitor-foundry/entry/src/mount.mjs");
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
      id: "vf10:original-task-distribution",
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
      hostProfile: { id: "host:original-task-distribution" },
      participationKey: "original-task-distribution-purpose-key",
    },
  });
  const handle = app.get("s51Correspondence");
  await handle.ready();
  const server = await listen(app);
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await handle.close().catch(() => {});
    await closeServer(server).catch(() => {});
    await closeServer(source.server).catch(() => {});
    await pg.stop();
    rmSync(work, { recursive: true, force: true });
  });

  const cache = join(work, "cache");
  const taskFile = join(work, "task.json");
  const retrieveFile = join(work, "retrieve.json");
  const directory = join(work, "private");
  writeFileSync(taskFile, JSON.stringify(TASK));
  writeFileSync(retrieveFile, JSON.stringify(inquiry("retrieve_continuation")));
  mkdirSync(directory, { mode: 0o700 });
  const acquired = classified(await runSkill(script, [
    "acquire", "--cache", cache, "--discovery-url", source.discoveryUrl,
  ]));
  assert.equal(acquired.acquisition.matched, true);
  const qualified = classified(await runSkill(script, ["map", "--cache", relative(tmpdir(), cache), "--task-file", relative(tmpdir(), taskFile)]));
  assert.equal(qualified.result.action, "submit_existing_correspondence");
  assert.equal(qualified.submission, null);

  const submittedRun = await runSkill(script, [
    "submit", "--cache", cache, "--base-url", `${origin}/api/correspondence`,
    "--directory", relative(tmpdir(), directory), "--task-file", relative(tmpdir(), taskFile), "--submit", "yes",
  ]);
  const submitted = classified(submittedRun);
  assert.equal(submittedRun.code, 0, submittedRun.stdout);
  assert.equal(submitted.error, null);
  assert.equal(submitted.submission.submitted, true);
  assert.equal(submitted.submission.intentional, true);
  assert.equal(submitted.disposition.disposition, "pending_qualification");
  assert.equal(submitted.delivery.delivered, false);
  assert.equal(submitted.acceptance.accepted, false);
  assert.equal(submitted.repeatUse, null);
  assert.equal(submitted.registration.code, "present");
  const secret = readFileSync(join(directory, "registration.secret"), "utf8");
  const privateReceipt = JSON.parse(readFileSync(join(directory, "receipt.json"), "utf8"));
  assert.equal(submittedRun.stdout.includes(secret.trim()), false);
  assert.equal(submittedRun.stdout.includes(privateReceipt.registrationId), false);
  assert.equal(JSON.stringify(submitted).includes(privateReceipt.projectId), false);
  assert.equal(source.counts.post, 0);

  await closeServer(source.server);
  const restarted = classified(await runSkill(script, [
    "map", "--cache", relative(tmpdir(), cache), "--task-file", relative(tmpdir(), retrieveFile), "--directory", relative(tmpdir(), directory),
  ]));
  assert.equal(restarted.result.action, "read_existing_attempt");
  assert.equal(restarted.result.continuation, "same_private_read");
  assert.equal(restarted.submission, null);
  assert.equal(JSON.stringify(restarted).includes(privateReceipt.projectId), false);

  const readBack = classified(await runSkill(script, ["read", "--cache", relative(tmpdir(), cache), "--directory", relative(tmpdir(), directory)]));
  assert.equal(readBack.disposition.disposition, "pending_qualification");
  assert.equal(readBack.delivery.delivered, false);
  assert.equal(readBack.acceptance.accepted, false);
  assert.equal(readBack.submission, null);
  assert.deepEqual(readBack.repeatUse, {
    kind: "local_continuation_retrieval",
    acceptedUsefulJob: false,
    customerDemand: false,
  });
  assert.equal(readBack.registration.code, "present");
  assert.equal(readBack.result.accepted, false);

  const projectId = JSON.parse(readFileSync(join(directory, "continuation.json"), "utf8")).projectId;
  const scoped = await fetch(`${origin}/api/correspondence/v1/operator/original-tasks/${projectId}/disposition`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ADMIN}`,
      "content-type": "application/json",
      "idempotency-key": `distribution-${projectId}`,
    },
    body: JSON.stringify({
      schema: "samedaydesk.original-task-disposition.v1",
      disposition: "scoped_result",
      scope: "Owner QA only.",
      result: "SCOPE_SENTENCE_DISTRIBUTION_ONLY",
    }),
  });
  assert.equal(scoped.status, 201);
  const later = classified(await runSkill(script, ["read", "--cache", relative(tmpdir(), cache), "--directory", relative(tmpdir(), directory)]));
  assert.equal(later.disposition.disposition, "scoped_result");
  assert.equal(later.delivery.delivered, true);
  assert.equal(later.acceptance.accepted, false);
  assert.equal(later.payment.payment, null);
  assert.deepEqual(later.repeatUse, {
    kind: "local_continuation_retrieval",
    acceptedUsefulJob: false,
    customerDemand: false,
  });
  assert.equal(later.result.accepted, false);
  assert.equal(JSON.stringify(later).includes("SCOPE_SENTENCE_DISTRIBUTION_ONLY"), false);
  assert.equal(JSON.parse(readFileSync(join(directory, "retrieval.json"), "utf8")).result, "SCOPE_SENTENCE_DISTRIBUTION_ONLY");
});

test("live public descriptor and archive match the pin", { timeout: 30000 }, async (t) => {
  const pins = JSON.parse(readFileSync(PINS_PATH, "utf8"));
  const discoveryUrl = `${pins.discovery.origin}${pins.discovery.pathname}`;
  const discoveryResponse = await fetch(discoveryUrl, { redirect: "manual" });
  assert.equal(discoveryResponse.status, 200);
  const discovery = await discoveryResponse.json();
  assert.equal(discovery.schema, "samedaydesk.original-task-correspondence.v1");
  assert.equal(discovery.deliveryPromise, false);
  assert.equal(discovery.acceptance, false);
  assert.equal(discovery.payment, false);
  assert.equal(discovery.acquisition.archive.sha256, pins.archive.sha256);
  assert.equal(discovery.acquisition.archive.bytes, pins.archive.bytes);
  const archiveResponse = await fetch(discovery.acquisition.archive.url, { redirect: "manual" });
  assert.equal(archiveResponse.status, 200);
  const bytes = Buffer.from(await archiveResponse.arrayBuffer());
  assert.equal(bytes.length, pins.archive.bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), pins.archive.sha256);

  const work = mkdtempSync(join(tmpdir(), "original-task-skill-live-"));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const script = installSkill(work);
  const acquiredRun = await runSkill(script, ["acquire", "--cache", join(work, "cache"), "--timeout-ms", "20000"]);
  const acquired = classified(acquiredRun);
  assert.equal(acquiredRun.code, 0);
  assert.equal(acquired.acquisition.matched, true);
  assert.equal(acquired.acquisition.sha256, pins.archive.sha256);
  assert.equal(acquired.acquisition.bytes, pins.archive.bytes);
  assert.equal(acquired.encounter.descriptorUrl, discoveryUrl);
  assert.equal(acquired.submission, null);
  assert.equal(acquired.install.clientExtracted, true);
});

test("cached bytes, cache ownership, and owned children stay bounded", { timeout: 60000 }, async (t) => {
  const work = mkdtempSync(join(tmpdir(), "original-task-skill-owned-"));
  const tempsBefore = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("otq-141430-")));
  const script = installSkill(work);
  const archive = readFileSync(ARCHIVE_PATH);
  const source = await contentServer({ discovery: (origin) => publishedDiscovery(origin), archive });
  t.after(() => {
    rmSync(work, { recursive: true, force: true });
    return closeServer(source.server);
  });
  const marker = `${JSON.stringify({ schema: "samedaydesk.original-task-qualification-cache.v1", package: "original-task-qualification" })}\n`;

  const unowned = join(work, "unowned");
  mkdirSync(join(unowned, "client"), { recursive: true });
  writeFileSync(join(unowned, "client/SENTINEL"), "KEEP_CLIENT");
  writeFileSync(join(unowned, "sentinel.txt"), "KEEP_ROOT");
  const unownedBefore = snapshot(unowned);
  const unownedRun = classified(await runSkill(script, [
    "acquire", "--cache", unowned, "--discovery-url", source.discoveryUrl, "--timeout-ms", "5000",
  ]));
  assert.equal(unownedRun.error.code, "cache_refused");
  assert.equal(snapshot(unowned), unownedBefore);
  assert.equal(source.counts.discovery, 0);

  const planted = join(work, "planted");
  mkdirSync(join(planted, "client"), { recursive: true });
  writeFileSync(join(planted, "client/SENTINEL"), "KEEP_CLIENT");
  writeFileSync(join(planted, "sentinel.txt"), "KEEP_ROOT");
  writeFileSync(join(planted, "cache-owner.json"), marker);
  const plantedBefore = snapshot(planted);
  const plantedRun = classified(await runSkill(script, [
    "acquire", "--cache", planted, "--discovery-url", source.discoveryUrl, "--timeout-ms", "5000",
  ]));
  assert.equal(plantedRun.error.code, "cache_refused");
  assert.equal(snapshot(planted), plantedBefore);

  const emptyExisting = join(work, "empty-existing");
  mkdirSync(emptyExisting);
  const emptyBefore = snapshot(emptyExisting);
  const emptyRun = classified(await runSkill(script, [
    "acquire", "--cache", emptyExisting, "--discovery-url", source.discoveryUrl, "--timeout-ms", "5000",
  ]));
  assert.equal(emptyRun.error.code, "cache_refused");
  assert.equal(snapshot(emptyExisting), emptyBefore);

  const absent = join(work, "installed/original-task-qualification/absent-cache");
  assert.equal(existsSync(absent), false);
  const absentRun = classified(await runSkill(script, [
    "acquire", "--cache", absent, "--discovery-url", source.discoveryUrl, "--timeout-ms", "5000",
  ]));
  assert.equal(absentRun.error.code, "cache_refused");
  assert.equal(existsSync(absent), false);

  const linkTarget = join(work, "link-target");
  mkdirSync(linkTarget);
  writeFileSync(join(linkTarget, "sentinel.txt"), "TARGET");
  const cacheLink = join(work, "cache-link");
  symlinkSync(linkTarget, cacheLink);
  const linkBefore = snapshot(linkTarget);
  const linkRun = classified(await runSkill(script, [
    "acquire", "--cache", cacheLink, "--discovery-url", source.discoveryUrl, "--timeout-ms", "5000",
  ]));
  assert.equal(linkRun.error.code, "cache_refused");
  assert.equal(snapshot(linkTarget), linkBefore);
  assert.equal(lstatSync(cacheLink).isSymbolicLink(), true);

  const realParent = join(work, "real-parent");
  mkdirSync(realParent);
  writeFileSync(join(realParent, "sentinel.txt"), "PARENT");
  const parentLink = join(work, "parent-link");
  symlinkSync(realParent, parentLink);
  const parentBefore = snapshot(realParent);
  const parentRun = classified(await runSkill(script, [
    "acquire", "--cache", join(parentLink, "cache"), "--discovery-url", source.discoveryUrl, "--timeout-ms", "5000",
  ]));
  assert.equal(parentRun.error.code, "cache_refused");
  assert.equal(existsSync(join(realParent, "cache")), false);
  assert.equal(snapshot(realParent), parentBefore);
  assert.equal(source.counts.discovery, 0);
  assert.equal(source.counts.post, 0);

  const cache = join(work, "cache");
  const acquired = classified(await runSkill(script, [
    "acquire", "--cache", cache, "--discovery-url", source.discoveryUrl, "--timeout-ms", "5000",
  ]));
  assert.equal(acquired.acquisition.matched, true);
  assert.equal(acquired.acquisition.fetched, true);
  assert.equal(acquired.install.clientExtracted, true);
  assert.equal(existsSync(join(cache, "client")), false);
  assert.equal(JSON.parse(readFileSync(join(cache, "cache-owner.json"), "utf8")).package, "original-task-qualification");
  const taskFile = join(work, "task.json");
  writeFileSync(taskFile, JSON.stringify(TASK));
  const realCli = readFileSync(join(ROOT, "server/lib/original-task/cli.mjs"));
  const cliBody = Buffer.from('console.log(JSON.stringify({canary:"TAMPER_CANARY_CLI"}));\n');
  const cliPlanted = Buffer.concat([cliBody, Buffer.alloc(realCli.length - cliBody.length, 0x20)]);
  assert.equal(cliPlanted.length, realCli.length);
  const cliPath = join(cache, "client/server/lib/original-task/cli.mjs");
  mkdirSync(join(cache, "client/server/lib/original-task"), { recursive: true });
  writeFileSync(cliPath, cliPlanted);
  const described = classified(await runSkill(script, ["describe", "--cache", cache, "--timeout-ms", "5000"]));
  assert.equal(described.result.schema, "samedaydesk.original-task-correspondence.v1");
  assert.equal(described.result.deliveryPromise, false);
  assert.equal(described.acquisition.fetched, false);
  assert.equal(described.install.clientExtracted, true);
  assert.equal(described.stdout, undefined);
  assert.equal(JSON.stringify(described).includes("TAMPER_CANARY_CLI"), false);
  assert.equal(readFileSync(cliPath).equals(cliPlanted), true);
  assert.equal(source.counts.discovery, 1);

  const realHelper = readFileSync(join(ROOT, "server/lib/original-task/action.mjs"));
  const helperBody = Buffer.from('export function mapOriginalTask(){ return { action:"tampered", code:"TAMPER_CANARY_HELPER", payment:false, deliveryPromise:false, acceptance:false }; }\n');
  const helperPlanted = Buffer.concat([helperBody, Buffer.alloc(realHelper.length - helperBody.length, 0x20)]);
  assert.equal(helperPlanted.length, realHelper.length);
  const helperPath = join(cache, "client/server/lib/original-task/action.mjs");
  writeFileSync(helperPath, helperPlanted);
  const mapped = classified(await runSkill(script, ["map", "--cache", cache, "--task-file", taskFile, "--timeout-ms", "5000"]));
  assert.equal(mapped.result.action, "submit_existing_correspondence");
  assert.equal(mapped.result.code, "ok");
  assert.equal(mapped.submission, null);
  assert.equal(JSON.stringify(mapped).includes("TAMPER_CANARY_HELPER"), false);
  assert.equal(readFileSync(helperPath).equals(helperPlanted), true);

  const foreign = join(work, "foreign");
  mkdirSync(join(foreign, "server/lib/original-task"), { recursive: true });
  writeFileSync(join(foreign, "server/lib/original-task/cli.mjs"), 'console.log(JSON.stringify({canary:"TAMPER_CANARY_LINK"}));\n');
  writeFileSync(join(foreign, "sentinel.txt"), "FOREIGN_SENTINEL");
  rmSync(join(cache, "client"), { recursive: true, force: true });
  symlinkSync(foreign, join(cache, "client"));
  const linked = classified(await runSkill(script, ["describe", "--cache", cache, "--timeout-ms", "5000"]));
  assert.equal(linked.result.schema, "samedaydesk.original-task-correspondence.v1");
  assert.equal(JSON.stringify(linked).includes("TAMPER_CANARY_LINK"), false);
  assert.equal(readFileSync(join(foreign, "sentinel.txt"), "utf8"), "FOREIGN_SENTINEL");
  assert.equal(lstatSync(join(cache, "client")).isSymbolicLink(), true);
  assert.equal(source.counts.discovery, 1);

  const staleCache = join(work, "stale-cache");
  assert.equal(classified(await runSkill(script, [
    "acquire", "--cache", staleCache, "--discovery-url", source.discoveryUrl, "--timeout-ms", "5000",
  ])).acquisition.matched, true);
  const staleDiscovery = join(staleCache, "discovery.json");
  const staleCopy = JSON.parse(readFileSync(staleDiscovery, "utf8"));
  staleCopy.acquisition.archive.sha256 = "b".repeat(64);
  writeFileSync(staleDiscovery, JSON.stringify(staleCopy));
  const staleBytes = readFileSync(staleDiscovery);
  const staleRun = classified(await runSkill(script, ["describe", "--cache", staleCache, "--timeout-ms", "5000"]));
  assert.equal(staleRun.error.code, "stale_discovery");
  assert.equal(staleRun.result, null);
  assert.equal(readFileSync(staleDiscovery).equals(staleBytes), true);
  assert.equal(source.counts.discovery, 2);

  const sourceCache = join(work, "source-cache");
  assert.equal(classified(await runSkill(script, [
    "acquire", "--cache", sourceCache, "--discovery-url", source.discoveryUrl, "--timeout-ms", "5000",
  ])).acquisition.fetched, true);
  const sourceFile = join(sourceCache, "source.json");
  writeFileSync(sourceFile, "{");
  const sourceBytes = readFileSync(sourceFile);
  const sourceRun = classified(await runSkill(script, ["describe", "--cache", sourceCache, "--timeout-ms", "5000"]));
  assert.equal(sourceRun.error.code, "stale_discovery");
  assert.equal(readFileSync(sourceFile).equals(sourceBytes), true);
  assert.equal(source.counts.discovery, 3);
  const refreshed = classified(await runSkill(script, [
    "describe", "--cache", sourceCache, "--discovery-url", source.discoveryUrl, "--refresh", "yes", "--timeout-ms", "5000",
  ]));
  assert.equal(refreshed.error, null);
  assert.equal(refreshed.acquisition.fetched, true);
  assert.equal(refreshed.result.deliveryPromise, false);
  assert.equal(source.counts.discovery, 4);
  const again = classified(await runSkill(script, ["describe", "--cache", sourceCache, "--timeout-ms", "5000"]));
  assert.equal(again.acquisition.fetched, false);
  assert.equal(again.result.schema, "samedaydesk.original-task-correspondence.v1");
  assert.equal(source.counts.discovery, 4);

  const flippedCache = join(work, "flipped-cache");
  assert.equal(classified(await runSkill(script, [
    "acquire", "--cache", flippedCache, "--discovery-url", source.discoveryUrl, "--timeout-ms", "5000",
  ])).acquisition.matched, true);
  const flippedArchive = join(flippedCache, "original-task-client.tar.gz");
  const flipped = readFileSync(flippedArchive);
  flipped[20] ^= 0xff;
  writeFileSync(flippedArchive, flipped);
  const flippedBytes = readFileSync(flippedArchive);
  const flippedRun = classified(await runSkill(script, ["describe", "--cache", flippedCache, "--timeout-ms", "5000"]));
  assert.equal(flippedRun.error.code, "archive_refused");
  assert.equal(readFileSync(flippedArchive).equals(flippedBytes), true);
  assert.equal(source.counts.discovery, 5);

  const overlapCache = join(work, "overlap-cache");
  assert.equal(classified(await runSkill(script, [
    "acquire", "--cache", overlapCache, "--discovery-url", source.discoveryUrl, "--timeout-ms", "5000",
  ])).install.clientExtracted, true);
  const beforeSame = snapshot(overlapCache);
  const samePath = classified(await runSkill(script, [
    "submit", "--cache", overlapCache, "--base-url", `${source.origin}/api/correspondence`,
    "--directory", overlapCache, "--task-file", taskFile, "--submit", "yes", "--timeout-ms", "5000",
  ]));
  assert.equal(samePath.error.code, "cache_private_overlap");
  assert.equal(snapshot(overlapCache), beforeSame);
  assert.equal(existsSync(join(overlapCache, "registration.secret")), false);
  mkdirSync(join(overlapCache, "nested-private"));
  writeFileSync(join(overlapCache, "nested-private/sentinel.txt"), "NESTED");
  const beforeNested = snapshot(overlapCache);
  const nestedPrivate = classified(await runSkill(script, [
    "submit", "--cache", overlapCache, "--base-url", `${source.origin}/api/correspondence`,
    "--directory", join(overlapCache, "nested-private"), "--task-file", taskFile, "--submit", "yes",
  ]));
  assert.equal(nestedPrivate.error.code, "cache_private_overlap");
  assert.equal(snapshot(overlapCache), beforeNested);

  const outerPrivate = join(work, "outer-private");
  mkdirSync(outerPrivate);
  writeFileSync(join(outerPrivate, "sentinel.txt"), "OUTER");
  const beforeOuter = snapshot(outerPrivate);
  const cacheInside = join(outerPrivate, "cache");
  const insidePrivate = classified(await runSkill(script, [
    "read", "--cache", cacheInside, "--directory", outerPrivate, "--timeout-ms", "5000",
  ]));
  assert.equal(insidePrivate.error.code, "cache_private_overlap");
  assert.equal(existsSync(cacheInside), false);
  assert.equal(snapshot(outerPrivate), beforeOuter);

  const siblingPrivate = join(work, "sibling-private");
  mkdirSync(siblingPrivate, { mode: 0o700 });
  const sibling = classified(await runSkill(script, [
    "map", "--cache", cache, "--task-file", join(work, "retrieve.json"), "--directory", siblingPrivate, "--timeout-ms", "5000",
  ]));
  writeFileSync(join(work, "retrieve.json"), JSON.stringify(inquiry("retrieve_continuation")));
  const siblingAfter = classified(await runSkill(script, [
    "map", "--cache", cache, "--task-file", join(work, "retrieve.json"), "--directory", siblingPrivate, "--timeout-ms", "5000",
  ]));
  assert.equal(siblingAfter.error, null);
  assert.equal(siblingAfter.result.code, "missing_private_authority");
  assert.equal(source.counts.post, 0);

  const pidFile = join(work, "tar.pid");
  const bin = join(work, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "tar"), `#!/bin/sh
trap '' TERM
printf '%s\\n' $$ > '${pidFile}'
sleep 30
`);
  chmodSync(join(bin, "tar"), 0o755);
  const tarCache = join(work, "tar-cache");
  const tarRun = classified(await runSkill(script, [
    "acquire", "--cache", tarCache, "--discovery-url", source.discoveryUrl, "--timeout-ms", "1000",
  ], { PATH: `${bin}:${process.env.PATH || ""}` }));
  assert.equal(tarRun.error.code, "extract_timeout");
  assert.equal(tarRun.install, null);
  const tarPid = Number(readFileSync(pidFile, "utf8"));
  assert.equal(alive(tarPid), false);
  assert.equal(existsSync(join(tarCache, "client")), false);

  const { runOwnedChild } = await import(pathToFileURL(script).href);
  const childEnv = { PATH: process.env.PATH || "", HOME: process.env.HOME || "", TMPDIR: work, LANG: "C" };
  const sleeper = join(work, "sleeper.mjs");
  const sleeperPid = join(work, "sleeper.pid");
  writeFileSync(sleeper, `import { writeFileSync } from "node:fs";
process.on("SIGTERM", () => {});
writeFileSync(process.argv[2], String(process.pid));
setInterval(() => {}, 1000);
`);
  const timed = await runOwnedChild(process.execPath, [sleeper, sleeperPid], {
    cwd: work,
    env: childEnv,
    timeoutMs: 400,
    graceMs: 200,
    maxStdout: 1000,
    maxStderr: 1000,
  });
  assert.equal(timed.error, "client_timeout");
  assert.equal(timed.gone, true);
  assert.equal(alive(Number(readFileSync(sleeperPid, "utf8"))), false);

  const writer = join(work, "writer.mjs");
  const writerPid = join(work, "writer.pid");
  writeFileSync(writer, `import { writeFileSync } from "node:fs";
process.on("SIGTERM", () => {});
writeFileSync(process.argv[2], String(process.pid));
process.stdout.write("Y".repeat(300000));
setInterval(() => { process.stdout.write("Y".repeat(100000)); }, 10);
`);
  const flooded = await runOwnedChild(process.execPath, [writer, writerPid], {
    cwd: work,
    env: childEnv,
    timeoutMs: 5000,
    graceMs: 200,
    maxStdout: 4096,
    maxStderr: 1000,
  });
  assert.equal(flooded.error, "client_output");
  assert.equal(flooded.stdout, "");
  assert.equal(flooded.gone, true);
  assert.equal(alive(Number(readFileSync(writerPid, "utf8"))), false);

  const cancelPid = join(work, "cancel.pid");
  const cancelController = new AbortController();
  const cancelling = runOwnedChild(process.execPath, [sleeper, cancelPid], {
    cwd: work,
    env: childEnv,
    timeoutMs: 10000,
    graceMs: 200,
    maxStdout: 1000,
    maxStderr: 1000,
    signal: cancelController.signal,
  });
  setTimeout(() => cancelController.abort(), 100);
  const cancelled = await cancelling;
  assert.equal(cancelled.error, "client_cancelled");
  assert.equal(cancelled.gone, true);
  assert.equal(alive(Number(readFileSync(cancelPid, "utf8"))), false);

  const refusal = join(work, "refusal.mjs");
  writeFileSync(refusal, `console.error(JSON.stringify({ error: { code: "missing_private_authority" } }));
process.exit(1);
`);
  const refused = await runOwnedChild(process.execPath, [refusal], {
    cwd: work,
    env: childEnv,
    timeoutMs: 2000,
    maxStdout: 1000,
    maxStderr: 1000,
  });
  assert.equal(refused.error, undefined);
  assert.equal(refused.code, 1);
  assert.equal(JSON.parse(refused.stderr).error.code, "missing_private_authority");

  const quick = join(work, "quick.mjs");
  writeFileSync(quick, `console.log(JSON.stringify({ ok: true }));\n`);
  const completed = await runOwnedChild(process.execPath, [quick], {
    cwd: work,
    env: childEnv,
    timeoutMs: 2000,
    maxStdout: 1000,
    maxStderr: 1000,
  });
  assert.equal(completed.error, undefined);
  assert.equal(completed.code, 0);
  assert.equal(JSON.parse(completed.stdout).ok, true);
  assert.deepEqual(readdirSync(tmpdir()).filter((name) => name.startsWith("otq-141430-") && !tempsBefore.has(name)), []);
  assert.equal(sibling.error.code, "arguments_required");
});
