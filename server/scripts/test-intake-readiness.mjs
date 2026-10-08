// Real foundry opt-in startup. A stale historical portable pool must not be
// reported as a database failure, and it must still fail execution checks.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import pg from "pg";
import { startDisposablePg } from "./fixtures/disposable-pg.mjs";
import { hashToken } from "../../vendor/visitor-foundry-receiver/services/correspondence/dist/crypto.js";
import { IntegrationStore, poolConfig } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/src/store.mjs";
import { PORTABLE_KIND } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/src/portable-profile.mjs";
import { verificationFor } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/src/verification.mjs";
import { hash } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/capabilities/src/index.mjs";
import { readOriginalTask } from "../lib/original-task/client.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const receiver = path.join(root, "vendor/visitor-foundry-receiver");
const preload = path.join(root, "server/scripts/fixtures/hosted-startup-preload.mjs");
const cli = path.join(root, "server/lib/original-task/cli.mjs");
const ADMIN = "intake-readiness-admin-token-24";
const STALE = "prj_histstale0000001";
const VALID = "prj_histvalid0000001";
const SCHEMA = "pilot_correspondence";
const TOKENS = {
  staleOwner: "stale-owner-token-000000000001",
  validOwner: "valid-owner-token-000000000001",
  validReader: "valid-reader-token-00000000001",
  validExpired: "valid-expired-token-0000000001",
};

function portableConfig(projectId) {
  const config = poolConfig(projectId);
  config.kind = PORTABLE_KIND;
  return config;
}

function historicalVerification(current) {
  const body = { ...current, runtimePin: `sha256:${"11".repeat(32)}` };
  delete body.id;
  return { ...body, id: hash(body) };
}

function admissionBody() {
  return {
    schema: "neomorphic.foundry.candidate-admission.v1",
    cellId: "cell:missing",
    workflowRevision: 1,
    fence: 1,
    identity: {
      schema: "neomorphic.foundry.candidate-identity.v1",
      target: {
        capabilityId: "capability:historical",
        version: "v1",
        contentId: `sha256:${"ab".repeat(32)}`,
      },
      dependencies: [],
    },
    artifact: { kind: "not-executed" },
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

async function withClient(databaseUrl, fn) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`SET search_path TO ${SCHEMA}`);
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function insertHistorical(databaseUrl, projectId, config, verification, grants) {
  await withClient(databaseUrl, async (client) => {
    await client.query(
      `INSERT INTO correspondence_projects(id,title,summary,status,version,created_at,updated_at)
       VALUES($1,'Historical portable pool','Disposable profile kept beside a current installed host.','open',1,clock_timestamp(),clock_timestamp())`,
      [projectId],
    );
    await client.query(
      "INSERT INTO correspondence_vf04_pools(project_id,config,verification) VALUES($1,$2::jsonb,$3::jsonb)",
      [projectId, JSON.stringify(config), JSON.stringify(verification)],
    );
    await client.query(
      `INSERT INTO correspondence_vf04_candidates(project_id,id,semantic_key,cell_id,submission_id,candidate,manifest,artifact,generation,verification)
       VALUES($1,'candidate:historical','semantic:historical','cell:historical','submission:historical','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,1,$2::jsonb)`,
      [projectId, JSON.stringify(verification)],
    );
    await client.query(
      `INSERT INTO correspondence_vf04_attempts(project_id,id,candidate_id,assignment,fence,state,generation,verification)
       VALUES($1,'attempt:historical','candidate:historical','{"historical":true}'::jsonb,'fence-historical','reconciled',1,$2::jsonb)`,
      [projectId, JSON.stringify(verification)],
    );
    await client.query(
      `INSERT INTO correspondence_vf04_publications(project_id,candidate_id,receipt,state,generation,verification)
       VALUES($1,'candidate:historical','{"id":"receipt:historical"}'::jsonb,'pending',1,$2::jsonb)`,
      [projectId, JSON.stringify(verification)],
    );
    for (const grant of grants) {
      await client.query(
        `INSERT INTO correspondence_grants(id,project_id,role,token_hash,expires_at,created_at)
         VALUES($1,$2,$3,$4,$5,clock_timestamp())`,
        [grant.id, projectId, grant.role, hashToken(grant.token), grant.expires],
      );
    }
  });
}

async function evidence(databaseUrl) {
  return withClient(databaseUrl, async (client) => {
    const rows = async (sql, params = []) => (await client.query(sql, params)).rows;
    const historical = [STALE, VALID];
    return {
      host: await rows("SELECT config FROM correspondence_vf12_host"),
      entry: await rows("SELECT charged, max_enrollments FROM correspondence_vf10_installation"),
      pools: await rows(
        `SELECT project_id, config, verification, participation FROM correspondence_vf04_pools
         WHERE project_id = ANY($1) ORDER BY project_id`,
        [historical],
      ),
      candidates: await rows(
        `SELECT project_id, id, generation, verification FROM correspondence_vf04_candidates
         WHERE project_id = ANY($1) ORDER BY project_id, id`,
        [historical],
      ),
      attempts: await rows(
        `SELECT project_id, id, state, generation, verification, termination, children
         FROM correspondence_vf04_attempts WHERE project_id = ANY($1) ORDER BY project_id, id`,
        [historical],
      ),
      publications: await rows(
        `SELECT project_id, candidate_id, state, generation, verification
         FROM correspondence_vf04_publications WHERE project_id = ANY($1) ORDER BY project_id, candidate_id`,
        [historical],
      ),
      grants: await rows(
        `SELECT id, project_id, role, token_hash, expires_at, revoked_at
         FROM correspondence_grants WHERE project_id = ANY($1) ORDER BY id`,
        [historical],
      ),
      invocations: (await rows("SELECT count(*)::int AS n FROM correspondence_vf04_invocations"))[0].n,
      admissions: await rows("SELECT project_id, state, charged FROM correspondence_vf12_admissions ORDER BY project_id"),
    };
  });
}

function serverEnv(databaseUrl, files, extra = {}) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "test",
    PORT: "0",
    CORRESPONDENCE_ADMIN_TOKEN: ADMIN,
    CORRESPONDENCE_PG_SCHEMA: SCHEMA,
    CORRESPONDENCE_POOL_MAX: "1",
    CORRESPONDENCE_STORE: "postgres",
    CORRESPONDENCE_TRUST_PROXY: "0",
    CORRESPONDENCE_CORS_ORIGINS: "https://neomorphic.io",
    CORRESPONDENCE_RATE_LIMIT_MAX: "1000",
    FOUNDRY_HOST_OPT_IN: "1",
    CORRESPONDENCE_DATABASE_URL: databaseUrl,
    FOUNDRY_HOST_PROFILE_FILE: files.hostProfile,
    FOUNDRY_PARTICIPATION_KEY_FILE: files.participationKey,
    ...extra,
  };
}

async function boot(databaseUrl, files, extra = {}) {
  const child = spawn(process.execPath, ["--import", preload, "server/index.js"], {
    cwd: root,
    env: serverEnv(databaseUrl, files, extra),
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let stderr = "";
  child.stderr.on("data", (buf) => { stderr += buf; });
  const message = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not listen: ${stderr}`)), 20000);
    child.once("message", (msg) => { clearTimeout(timer); resolve(msg); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`server exit ${code}: ${stderr}`)); });
  });
  return {
    child,
    origin: `http://127.0.0.1:${message.port}`,
    stderr: () => stderr,
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

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  if (text) body = JSON.parse(text);
  return { status: response.status, body };
}

async function codeOf(fn) {
  try {
    await fn();
    return null;
  } catch (error) {
    return error.code || null;
  }
}

test("stale historical portable verification stays project-scoped", { timeout: 240000 }, async (t) => {
  const pgCluster = await startDisposablePg();
  const dir = await mkdtemp(path.join(tmpdir(), "sds-intake-ready-"));
  const servers = [];
  t.after(async () => {
    for (const server of servers) await server.stop().catch(() => {});
    await rm(dir, { recursive: true, force: true });
    await pgCluster.stop();
  });
  const host = JSON.parse(await readFile(path.join(
    receiver, "scripts/visitor-foundry/integration/entry/host-profile.example.json",
  ), "utf8"));
  const profile = JSON.parse(await readFile(path.join(
    receiver, "scripts/visitor-foundry/integration/entry/private-profile.example.json",
  ), "utf8"));
  const files = {
    hostProfile: path.join(dir, "host-profile.json"),
    privateProfile: path.join(dir, "private-profile.json"),
    participationKey: path.join(dir, "participation.key"),
  };
  await writeFile(files.hostProfile, JSON.stringify(host), { mode: 0o600 });
  await writeFile(files.privateProfile, JSON.stringify(profile), { mode: 0o600 });
  await writeFile(files.participationKey, "vf12-sds-server-private-purpose-key-32\n", { mode: 0o600 });
  const installed = await runNode(["server/foundry/install.mjs", "--migrate", "--install"], {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    CORRESPONDENCE_DATABASE_URL: pgCluster.url,
    CORRESPONDENCE_PG_SCHEMA: SCHEMA,
    FOUNDRY_HOST_PROFILE_FILE: files.hostProfile,
    FOUNDRY_PARTICIPATION_KEY_FILE: files.participationKey,
    FOUNDRY_PRIVATE_PROFILE_FILE: files.privateProfile,
  });
  assert.equal(installed.code, 0, installed.stderr);
  assert.equal(JSON.parse(installed.stdout).charged, 0);
  const validConfig = portableConfig(VALID);
  const staleConfig = portableConfig(STALE);
  const validVerification = verificationFor(validConfig);
  const staleVerification = historicalVerification(verificationFor(staleConfig));
  assert.notEqual(staleVerification.runtimePin, validVerification.runtimePin);
  const later = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const earlier = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await insertHistorical(pgCluster.url, STALE, staleConfig, staleVerification, [
    { id: "grant:stale-owner", role: "owner", token: TOKENS.staleOwner, expires: later },
  ]);
  await insertHistorical(pgCluster.url, VALID, validConfig, validVerification, [
    { id: "grant:valid-owner", role: "owner", token: TOKENS.validOwner, expires: later },
    { id: "grant:valid-reader", role: "reader", token: TOKENS.validReader, expires: later },
    { id: "grant:valid-expired", role: "owner", token: TOKENS.validExpired, expires: earlier },
  ]);
  const before = await evidence(pgCluster.url);
  assert.equal(before.entry[0].charged, 0);
  assert.equal(before.invocations, 0);
  assert.equal(before.admissions.length, 0);
  assert.equal(before.attempts.length, 2);

  async function readyCollection(server) {
    const health = await jsonFetch(`${server.origin}/api/health`);
    const healthz = await jsonFetch(`${server.origin}/api/correspondence/healthz`);
    const operator = await jsonFetch(`${server.origin}/api/correspondence/v1/operator/original-tasks`, {
      headers: { authorization: `Bearer ${ADMIN}` },
    });
    assert.equal(health.status, 200);
    assert.equal(health.body.service, "samedaydesk");
    assert.deepEqual(healthz.body, { ok: true, enabled: true, store: "postgres" });
    assert.equal(operator.status, 200);
    assert.equal(operator.body.schema, "samedaydesk.original-task-collection.v1");
    assert.equal(server.stderr().includes("installed_verification_changed"), false);
    assert.equal(server.stderr().includes("correspondence_store_unavailable"), false);
    return operator.body;
  }

  const first = await boot(pgCluster.url, files);
  servers.push(first);
  const empty = await readyCollection(first);
  assert.deepEqual(empty.tasks, []);
  assert.deepEqual(await evidence(pgCluster.url), before);
  await first.stop();

  const restarted = await boot(pgCluster.url, files);
  servers.push(restarted);
  const emptyAgain = await readyCollection(restarted);
  assert.deepEqual(emptyAgain.tasks, []);
  assert.deepEqual(await evidence(pgCluster.url), before);
  await restarted.stop();

  const integration = new IntegrationStore(pgCluster.url, { schema: SCHEMA });
  assert.equal(await codeOf(() => integration.loadPortableAttempt(STALE, "attempt:missing", "supervisor:none", "fence-missing")), "installed_verification_changed");
  assert.equal(await codeOf(() => integration.loadPortableAttempt(VALID, "attempt:missing", "supervisor:none", "fence-missing")), "stale_attempt_fence");
  assert.equal(await codeOf(() => integration.reserve(STALE, "command:stale-reserve-proof")), "installed_verification_changed");
  assert.equal(await codeOf(() => integration.admit(
    { projectId: STALE, token: TOKENS.staleOwner },
    admissionBody(),
    "admit-stale-proof-key",
  )), "installed_verification_changed");
  assert.equal(await codeOf(() => integration.admit(
    { projectId: VALID, token: TOKENS.validOwner },
    admissionBody(),
    "admit-valid-proof-key",
  )), "stale_cell_fence");
  assert.equal(await codeOf(() => integration.admit(
    { projectId: VALID, token: TOKENS.validReader },
    admissionBody(),
    "admit-reader-proof-key",
  )), "forbidden");
  assert.equal(await codeOf(() => integration.admit(
    { projectId: VALID, token: TOKENS.staleOwner },
    admissionBody(),
    "admit-wrong-project-key",
  )), "not_found");
  assert.equal(await codeOf(() => integration.admit(
    { projectId: VALID, token: TOKENS.validExpired },
    admissionBody(),
    "admit-expired-proof-key",
  )), "unauthorized");
  assert.equal(await codeOf(() => integration.publish(STALE, "candidate:historical", 1)), "installed_verification_changed");
  assert.equal(await codeOf(() => integration.publish(VALID, "candidate:historical", 1)), "installed_source_changed");
  assert.deepEqual(await evidence(pgCluster.url), before);

  const changed = structuredClone(validVerification);
  changed.validityMs = 100;
  await withClient(pgCluster.url, (client) => client.query(
    "UPDATE correspondence_vf04_pools SET verification=$2::jsonb WHERE project_id=$1",
    [VALID, JSON.stringify(changed)],
  ));
  assert.equal(await codeOf(() => integration.loadPortableAttempt(VALID, "attempt:missing", "supervisor:none", "fence-missing")), "installed_verification_changed");
  await withClient(pgCluster.url, (client) => client.query(
    "UPDATE correspondence_vf04_pools SET verification=$2::jsonb WHERE project_id=$1",
    [VALID, JSON.stringify(validVerification)],
  ));
  assert.equal(await codeOf(() => integration.loadPortableAttempt(VALID, "attempt:missing", "supervisor:none", "fence-missing")), "stale_attempt_fence");
  assert.deepEqual(await evidence(pgCluster.url), before);
  await integration.close();

  const intake = await boot(pgCluster.url, files);
  servers.push(intake);
  const base = `${intake.origin}/api/correspondence`;
  const taskDir = path.join(dir, "task");
  await mkdir(taskDir, { mode: 0o700 });
  const objective = "Local original task while a stale portable pool remains stored.";
  await writeFile(path.join(taskDir, "task.json"), JSON.stringify({
    objective,
    publicInput: { kind: "https_url", url: "https://samedaydesk.com/api/correspondence/v1/visitor-entry" },
    usefulOutput: "A private qualification or a useful refusal.",
    friction: "The operator collection must stay available.",
  }), { mode: 0o600 });
  const submitted = await runNode([cli, "submit", "--base-url", base, "--directory", taskDir, "--task-file", path.join(taskDir, "task.json")], {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
  });
  assert.equal(submitted.code, 0, submitted.stderr);
  const receipt = JSON.parse(submitted.stdout);
  assert.equal(receipt.stage, "submitted");
  assert.equal(receipt.submitted, true);
  const privateRead = await readOriginalTask(taskDir);
  assert.equal(privateRead.stage, "submitted");
  assert.match(privateRead.projectId, /^prj_[\w-]{16}$/);
  assert.equal([STALE, VALID].includes(privateRead.projectId), false);
  const collected = await jsonFetch(`${base}/v1/operator/original-tasks`, {
    headers: { authorization: `Bearer ${ADMIN}` },
  });
  assert.equal(collected.status, 200);
  assert.equal(collected.body.tasks.length, 1);
  assert.equal(collected.body.tasks[0].projectId, privateRead.projectId);
  assert.equal(collected.body.tasks[0].task.objective, objective);
  const afterSubmit = await evidence(pgCluster.url);
  assert.deepEqual(afterSubmit.pools, before.pools);
  assert.deepEqual(afterSubmit.candidates, before.candidates);
  assert.deepEqual(afterSubmit.attempts, before.attempts);
  assert.deepEqual(afterSubmit.publications, before.publications);
  assert.deepEqual(afterSubmit.grants, before.grants);
  assert.deepEqual(afterSubmit.host, before.host);
  assert.equal(afterSubmit.entry[0].max_enrollments, before.entry[0].max_enrollments);
  assert.equal(afterSubmit.entry[0].charged, 1);
  assert.equal(afterSubmit.invocations, 0);
  assert.equal(afterSubmit.admissions.some((row) => row.project_id === STALE || row.project_id === VALID), false);
  const intakePort = new URL(intake.origin).port;
  await intake.stop();

  const reread = await boot(pgCluster.url, files, { PORT: intakePort });
  servers.push(reread);
  const privateAgain = await readOriginalTask(taskDir);
  assert.equal(privateAgain.projectId, privateRead.projectId);
  assert.equal(privateAgain.stage, "submitted");
  const collectedAgain = await jsonFetch(`${reread.origin}/api/correspondence/v1/operator/original-tasks`, {
    headers: { authorization: `Bearer ${ADMIN}` },
  });
  assert.equal(collectedAgain.status, 200);
  assert.equal(collectedAgain.body.tasks.length, 1);
  assert.deepEqual(await evidence(pgCluster.url), afterSubmit);
  assert.equal(reread.stderr().includes("installed_verification_changed"), false);
  await reread.stop();

  const wrongHost = JSON.parse(JSON.stringify(host));
  wrongHost.id = "host:not-the-installed-one";
  const wrongFile = path.join(dir, "wrong-host.json");
  await writeFile(wrongFile, JSON.stringify(wrongHost), { mode: 0o600 });
  const mismatch = await boot(pgCluster.url, { ...files, hostProfile: wrongFile });
  servers.push(mismatch);
  const mismatchHealth = await jsonFetch(`${mismatch.origin}/api/health`);
  const mismatchHealthz = await jsonFetch(`${mismatch.origin}/api/correspondence/healthz`);
  const mismatchOperator = await jsonFetch(`${mismatch.origin}/api/correspondence/v1/operator/original-tasks`, {
    headers: { authorization: `Bearer ${ADMIN}` },
  });
  assert.equal(mismatchHealth.status, 200);
  assert.deepEqual(mismatchHealthz.body, { ok: false, enabled: false, reason: "store_unavailable" });
  assert.equal(mismatchOperator.status, 503);
  assert.equal(mismatchOperator.body.error.code, "store_unavailable");
  assert.match(mismatch.stderr(), /entry_readiness/);
  assert.match(mismatch.stderr(), /host_installation_mismatch/);
  assert.equal(mismatch.stderr().includes("installed_verification_changed"), false);
  await mismatch.stop();
  assert.deepEqual(await evidence(pgCluster.url), afterSubmit);

  const malformed = await boot(pgCluster.url, files, { CORRESPONDENCE_PG_SCHEMA: "public" });
  servers.push(malformed);
  const malformedHealthz = await jsonFetch(`${malformed.origin}/api/correspondence/healthz`);
  const malformedOperator = await jsonFetch(`${malformed.origin}/api/correspondence/v1/operator/original-tasks`, {
    headers: { authorization: `Bearer ${ADMIN}` },
  });
  assert.equal((await jsonFetch(`${malformed.origin}/api/health`)).status, 200);
  assert.deepEqual(malformedHealthz.body, { ok: false, enabled: false, reason: "invalid_config" });
  assert.equal(malformedOperator.status, 503);
  assert.equal(malformedOperator.body.error.code, "invalid_config");
  await malformed.stop();

  const refused = await boot("postgres://sds@127.0.0.1:1/correspondence", files);
  servers.push(refused);
  const refusedHealthz = await jsonFetch(`${refused.origin}/api/correspondence/healthz`);
  const refusedOperator = await jsonFetch(`${refused.origin}/api/correspondence/v1/operator/original-tasks`, {
    headers: { authorization: `Bearer ${ADMIN}` },
  });
  assert.equal((await jsonFetch(`${refused.origin}/api/health`)).status, 200);
  assert.deepEqual(refusedHealthz.body, { ok: false, enabled: false, reason: "store_unavailable" });
  assert.equal(refusedOperator.status, 503);
  assert.equal(refusedOperator.body.error.code, "store_unavailable");
  assert.match(refused.stderr(), /base_readiness/);
  assert.match(refused.stderr(), /ECONNREFUSED/);
  assert.equal(refused.stderr().includes("installed_verification_changed"), false);
  await refused.stop();

  await withClient(pgCluster.url, (client) => client.query("DROP TABLE correspondence_vf04_invocations"));
  const missingTable = await boot(pgCluster.url, files);
  servers.push(missingTable);
  const missingHealthz = await jsonFetch(`${missingTable.origin}/api/correspondence/healthz`);
  const missingOperator = await jsonFetch(`${missingTable.origin}/api/correspondence/v1/operator/original-tasks`, {
    headers: { authorization: `Bearer ${ADMIN}` },
  });
  assert.equal((await jsonFetch(`${missingTable.origin}/api/health`)).status, 200);
  assert.deepEqual(missingHealthz.body, { ok: false, enabled: false, reason: "store_unavailable" });
  assert.equal(missingOperator.status, 503);
  assert.equal(missingOperator.body.error.code, "store_unavailable");
  assert.match(missingTable.stderr(), /entry_readiness/);
  assert.match(missingTable.stderr(), /42P01/);
  assert.equal(missingTable.stderr().includes("installed_verification_changed"), false);
  await missingTable.stop();
});
