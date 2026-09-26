import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { chmod, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { grantToken } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/entry/src/contract.mjs";
import { cases, original, task } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/tests/entry-helpers.mjs";
import { startDisposablePg } from "./fixtures/disposable-pg.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const receiver = path.join(root, "vendor/visitor-foundry-receiver");
const preload = path.join(root, "server/scripts/fixtures/hosted-startup-preload.mjs");
const visitor = path.join(receiver, "scripts/visitor-foundry/integration/entry/visitor.mjs");
const ADMIN = "vf12-sds-entry-admin-token-24";

function privateFiles(dir, host, profile) {
  return {
    hostProfile: path.join(dir, "host-profile.json"),
    privateProfile: path.join(dir, "private-profile.json"),
    participationKey: path.join(dir, "participation.key"),
    host,
    profile,
  };
}

async function writeInputs(dir) {
  const host = JSON.parse(await readFile(path.join(
    receiver, "scripts/visitor-foundry/integration/entry/host-profile.example.json",
  ), "utf8"));
  host.maxAdmissions = 2;
  const profile = JSON.parse(await readFile(path.join(
    receiver, "scripts/visitor-foundry/integration/entry/private-profile.example.json",
  ), "utf8"));
  profile.maxEnrollments = 4;
  const files = privateFiles(dir, host, profile);
  await writeFile(files.hostProfile, JSON.stringify(host), { mode: 0o600 });
  await writeFile(files.privateProfile, JSON.stringify(profile), { mode: 0o600 });
  await writeFile(files.participationKey, "vf12-sds-server-private-purpose-key-32\n", { mode: 0o600 });
  return files;
}

function installEnv(databaseUrl, files) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    CORRESPONDENCE_DATABASE_URL: databaseUrl,
    CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    FOUNDRY_HOST_PROFILE_FILE: files.hostProfile,
    FOUNDRY_PARTICIPATION_KEY_FILE: files.participationKey,
    FOUNDRY_PRIVATE_PROFILE_FILE: files.privateProfile,
  };
}

function serverEnv(databaseUrl, files, optIn) {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "test",
    PORT: "0",
    CORRESPONDENCE_ADMIN_TOKEN: ADMIN,
    CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    CORRESPONDENCE_POOL_MAX: "1",
    CORRESPONDENCE_STORE: "postgres",
    CORRESPONDENCE_TRUST_PROXY: "0",
    CORRESPONDENCE_CORS_ORIGINS: "https://neomorphic.io",
  };
  if (optIn) {
    env.FOUNDRY_HOST_OPT_IN = "1";
    env.CORRESPONDENCE_DATABASE_URL = databaseUrl;
    env.FOUNDRY_HOST_PROFILE_FILE = files.hostProfile;
    env.FOUNDRY_PARTICIPATION_KEY_FILE = files.participationKey;
  }
  return env;
}

async function boot(databaseUrl, files, optIn = true) {
  const child = spawn(process.execPath, ["--import", preload, "server/index.js"], {
    cwd: root,
    env: serverEnv(databaseUrl, files, optIn),
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let stderr = "";
  child.stderr.on("data", (buf) => { stderr = (stderr + buf).slice(-3000); });
  const message = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not listen: ${stderr}`)), 15000);
    child.once("message", (msg) => { clearTimeout(timer); resolve(msg); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`server exit ${code}: ${stderr}`)); });
  });
  return {
    child,
    origin: `http://127.0.0.1:${message.port}`,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 4000);
      const [code] = await exited;
      clearTimeout(timer);
      assert.equal(code, 0);
    },
  };
}

function runNode(args, env, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (buf) => { stdout += buf; });
    child.stderr.on("data", (buf) => { stderr += buf; });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

async function counts(databaseUrl) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'pilot_correspondence' ORDER BY 1`,
    );
    const row = tables.rows.some((r) => r.table_name === "correspondence_vf10_installation")
      ? await client.query(`SELECT
          (SELECT charged FROM pilot_correspondence.correspondence_vf10_installation) AS charged,
          (SELECT count(*)::int FROM pilot_correspondence.correspondence_vf10_registrations) AS registrations,
          (SELECT count(*)::int FROM pilot_correspondence.correspondence_projects) AS projects,
          (SELECT count(*)::int FROM pilot_correspondence.correspondence_vf12_admissions WHERE state = 'ready') AS ready`)
      : { rows: [{ charged: null, registrations: 0, projects: 0, ready: 0 }] };
    return { tables: tables.rows.map((r) => r.table_name), ...row.rows[0] };
  } finally {
    await client.end();
  }
}

async function registerVisitor(origin, directory, authority) {
  const configPath = `${directory}.json`;
  await writeFile(configPath, JSON.stringify({
    baseUrl: `${origin}/api/correspondence`,
    directory,
    authority,
  }), { mode: 0o600 });
  const ran = await runNode([visitor, "register", configPath], { PATH: process.env.PATH, HOME: process.env.HOME }, receiver);
  return { ...ran, configPath };
}

test("cold visitors use the SDS server, and startup does not migrate", { timeout: 180000 }, async (t) => {
  const pgCluster = await startDisposablePg();
  const dir = await mkdtemp(path.join(tmpdir(), "sds-vf12-visitor-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
    await pgCluster.stop();
  });
  const files = await writeInputs(dir);
  const early = await boot(pgCluster.url, files, true);
  const health = await fetch(`${early.origin}/api/health`);
  const healthz = await fetch(`${early.origin}/api/correspondence/healthz`);
  const before = await counts(pgCluster.url);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, "samedaydesk");
  assert.equal((await healthz.json()).enabled, false);
  assert.equal(before.tables.includes("correspondence_projects"), false);
  assert.equal(before.tables.includes("correspondence_vf10_installation"), false);
  await early.stop();

  const migrated = await runNode(["server/foundry/install.mjs", "--migrate", "--install"], installEnv(pgCluster.url, files));
  assert.equal(migrated.code, 0, migrated.stderr);
  const installed = JSON.parse(migrated.stdout);
  assert.equal(installed.charged, 0);
  const repeat = await runNode(["server/foundry/install.mjs", "--migrate", "--install"], installEnv(pgCluster.url, files));
  assert.equal(repeat.code, 0, repeat.stderr);
  assert.equal(JSON.parse(repeat.stdout).charged, 0);
  assert.equal(JSON.parse(repeat.stdout).termsHash, installed.termsHash);

  const server = await boot(pgCluster.url, files, true);
  t.after(() => server.stop());
  const plain = spawn(process.execPath, ["--import", preload, "server/index.js"], {
    cwd: root,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test", PORT: "0" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const plainPort = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("plain server")), 8000);
    plain.once("message", (msg) => { clearTimeout(timer); resolve(msg.port); });
  });
  t.after(() => { if (plain.exitCode === null) plain.kill("SIGTERM"); });
  assert.equal((await fetch(`http://127.0.0.1:${plainPort}/api/health`)).status, 200);
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${plainPort}/api/correspondence/healthz`)).json(), {
    ok: false, enabled: false, reason: "unconfigured",
  });

  const ready = await (await fetch(`${server.origin}/api/correspondence/healthz`)).json();
  assert.equal(ready.enabled, true);
  assert.equal(ready.store, "postgres");
  const descriptor = await (await fetch(`${server.origin}/api/correspondence/v1/visitor-entry`)).json();
  const authority = {
    profileId: descriptor.profile.profileId,
    entryTerms: descriptor.profile.termsHash,
    contributionTerms: descriptor.profile.contribution.binding.contributionTerms,
    scope: "synthetic-reusable-components",
  };
  const aDir = path.join(dir, "a");
  const a = await registerVisitor(server.origin, aDir, authority);
  assert.equal(a.code, 0, a.stderr);
  const aBody = JSON.parse(a.stdout).body;
  assert.equal(aBody.receiver.state, "ready");
  assert.equal((await counts(pgCluster.url)).charged, 1);

  await unlink(path.join(aDir, "continuation.json"));
  const replay = await registerVisitor(server.origin, aDir, authority);
  assert.equal(replay.code, 0, replay.stderr);
  const replayBody = JSON.parse(replay.stdout).body;
  assert.equal(replayBody.projectId, aBody.projectId);
  assert.equal(replayBody.registrationId, aBody.registrationId);
  assert.equal((await counts(pgCluster.url)).charged, 1);

  const taskPath = path.join(dir, "contribute-task.json");
  await writeFile(taskPath, JSON.stringify(original()), { mode: 0o600 });
  const contributed = await runNode(
    [visitor, "contribute", a.configPath, taskPath],
    { PATH: process.env.PATH, HOME: process.env.HOME },
    receiver,
  );
  assert.equal(contributed.code, 0, contributed.stderr);
  const contribution = JSON.parse(contributed.stdout);
  const candidateId = contribution.submission.admission.candidateId;
  assert.equal(typeof candidateId, "string");
  const verified = await runNode(
    ["server/foundry/worker.mjs", "dispatch", aBody.projectId],
    {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      FOUNDRY_HOST_OPT_IN: "1",
      CORRESPONDENCE_DATABASE_URL: pgCluster.url,
      CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    },
  );
  assert.equal(verified.code, 0, verified.stderr);
  const published = await runNode(["--input-type=module", "-e", `
    import { IntegrationStore } from "./scripts/visitor-foundry/integration/src/store.mjs";
    const store = new IntegrationStore(process.env.CORRESPONDENCE_DATABASE_URL, { schema: process.env.CORRESPONDENCE_PG_SCHEMA, poolMax: 1 });
    try { console.log(JSON.stringify(await store.publish(process.env.FOUNDRY_PUBLISH_PROJECT, process.env.FOUNDRY_PUBLISH_CANDIDATE))); }
    finally { await store.close(); }
  `], {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    CORRESPONDENCE_DATABASE_URL: pgCluster.url,
    CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    FOUNDRY_PUBLISH_PROJECT: aBody.projectId,
    FOUNDRY_PUBLISH_CANDIDATE: candidateId,
  }, receiver);
  assert.equal(published.code, 0, published.stderr);
  assert.equal(JSON.parse(published.stdout).published, true);

  await server.stop();
  const restarted = await boot(pgCluster.url, files, true);
  t.after(() => restarted.stop());
  const bDir = path.join(dir, "b");
  const second = await boot(pgCluster.url, files, true);
  t.after(() => second.stop());
  const [b, c] = await Promise.all([
    registerVisitor(restarted.origin, bDir, authority),
    registerVisitor(second.origin, path.join(dir, "c"), authority),
  ]);
  assert.equal(b.code, 0, b.stderr);
  assert.equal(c.code, 0, c.stderr);
  const bBody = JSON.parse(b.stdout).body;
  const cBody = JSON.parse(c.stdout).body;
  assert.notEqual(bBody.projectId, aBody.projectId);
  const readyRun = bBody.receiver.state === "ready" ? b : c;
  const declinedBody = bBody.receiver.state === "declined" ? bBody : cBody;
  const readyBody = readyRun === b ? bBody : cBody;
  assert.equal(readyBody.receiver.state, "ready");
  assert.equal(declinedBody.receiver.state, "declined");
  assert.notEqual(readyBody.projectId, aBody.projectId);
  assert.notEqual(bBody.projectId, cBody.projectId);
  const usePath = path.join(dir, "use-task.json");
  await writeFile(usePath, JSON.stringify(task(cases[0].input)), { mode: 0o600 });
  const used = await runNode(
    [visitor, "use", readyRun.configPath, usePath],
    { PATH: process.env.PATH, HOME: process.env.HOME },
    receiver,
  );
  assert.equal(used.code, 0, used.stderr);
  const useBody = JSON.parse(used.stdout);
  assert.deepEqual(useBody.invocation.output, cases[0].expected);
  assert.equal(useBody.invocation.output === undefined, false);
  const afterCap = await counts(pgCluster.url);
  assert.equal(afterCap.charged, 3);
  assert.equal(afterCap.registrations, 3);
  assert.equal(afterCap.projects, 3);
  assert.equal(afterCap.ready, 2);

  const wrongDir = path.join(dir, "wrong");
  const wrong = await registerVisitor(restarted.origin, wrongDir, {
    ...authority,
    entryTerms: `sha256:${"ab".repeat(32)}`,
  });
  assert.equal(wrong.code, 1);
  assert.match(wrong.stderr, /standing_terms_mismatch/);
  assert.equal((await counts(pgCluster.url)).charged, 3);
  assert.equal((await counts(pgCluster.url)).registrations, 3);

  const proof = (await readFile(path.join(aDir, "registration.secret"), "utf8")).trim();
  const token = grantToken(proof, aBody.registrationId, "writer");
  const bypass = await fetch(`${restarted.origin}/api/correspondence/v1/projects/${aBody.projectId}/work-cells`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "idempotency-key": "bypass-1" },
    body: JSON.stringify({ action: "create" }),
  });
  const bypassBody = await bypass.json();
  assert.equal(bypass.status, 403);
  assert.equal(bypassBody.error.code, "entry_scope_excludes_receiver");

  const alias = path.join(dir, "alias.json");
  await writeFile(alias, JSON.stringify({ ...files.profile, id: "vf10:alias-budget" }), { mode: 0o600 });
  await chmod(alias, 0o600);
  const rejected = await runNode(["server/foundry/install.mjs", "--migrate", "--install"], {
    ...installEnv(pgCluster.url, files),
    FOUNDRY_PRIVATE_PROFILE_FILE: alias,
  });
  assert.equal(rejected.code, 1);
  assert.match(rejected.stderr, /immutable_installation/);
  assert.equal((await counts(pgCluster.url)).charged, 3);

  const uploads = await fetch(`${restarted.origin}/api/uploads/signed-url`, { method: "POST" });
  assert.equal(uploads.status, 501);
});
