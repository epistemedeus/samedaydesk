import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { chmod, copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { startDisposablePg } from "../../scripts/fixtures/disposable-pg.mjs";
import { cases, original, task } from "../../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/tests/entry-helpers.mjs";
import { judge, requireFact } from "./classify.mjs";
import { assessPreconditions } from "./preconditions.mjs";
import { observeOrigin } from "./observe.mjs";
import evidence from "./EVIDENCE.json" with { type: "json" };

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const receiverRoot = path.join(repoRoot, "vendor/visitor-foundry-receiver");
const preload = path.join(repoRoot, "server/scripts/fixtures/hosted-startup-preload.mjs");
const visitor = path.join(receiverRoot, "scripts/visitor-foundry/integration/entry/visitor.mjs");
const acceptCli = fileURLToPath(new URL("./postdeploy-accept.mjs", import.meta.url));
const falseGreen = fileURLToPath(new URL("./fixtures/seeded-false-green.json", import.meta.url));
const runtimePython = path.join(receiverRoot, "scripts/visitor-foundry/execution/.runtime/bin/python");

export function redact(text) {
  return String(text)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://<redacted>")
    .replace(/Bearer\s+\S+/gi, "Bearer <redacted>");
}

function fail(code, message) {
  const error = new Error(redact(message));
  error.exitCode = code;
  return error;
}

function runNode(args, env, cwd, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(fail(1, `timeout ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.on("data", (buf) => { stdout = (stdout + buf).slice(-100000); });
    child.stderr.on("data", (buf) => { stderr = (stderr + redact(buf.toString())).slice(-4000); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

function baseEnv() {
  return {
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || "",
    LANG: "C",
    LC_ALL: "C",
    NODE_ENV: "production",
    PORT: "0",
  };
}

function assertHold() {
  const raw = process.env.FOUNDRY_PRODUCTION_ACTIVATE;
  if (raw != null && String(raw).trim() !== "" && String(raw).trim() !== "HOLD") {
    throw fail(2, "production_activate_not_hold");
  }
}

async function boot(env) {
  const child = spawn(process.execPath, ["--import", preload, "server/index.js"], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let stderr = "";
  child.stderr.on("data", (buf) => { stderr = (stderr + redact(buf.toString())).slice(-3000); });
  const message = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(fail(1, `server did not listen: ${stderr}`)), 20000);
    child.once("message", (msg) => { clearTimeout(timer); resolve(msg); });
    child.once("exit", (code) => { clearTimeout(timer); reject(fail(1, `server exited ${code}: ${stderr}`)); });
  });
  return {
    origin: `http://127.0.0.1:${message.port}`,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return child.exitCode;
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 6000);
      const [code] = await exited;
      clearTimeout(timer);
      if (code !== 0) throw fail(1, `SIGTERM exit ${code}: ${stderr}`);
      return code;
    },
  };
}

async function writeInputs(dir) {
  const hostProfile = path.join(dir, "host-profile.json");
  const privateProfile = path.join(dir, "private-profile.json");
  const participationKey = path.join(dir, "participation.key");
  await copyFile(path.join(receiverRoot, "scripts/visitor-foundry/integration/entry/host-profile.example.json"), hostProfile);
  await copyFile(path.join(receiverRoot, "scripts/visitor-foundry/integration/entry/private-profile.example.json"), privateProfile);
  await writeFile(participationKey, `${randomBytes(24).toString("hex")}\n`, { mode: 0o600 });
  await chmod(hostProfile, 0o600);
  await chmod(privateProfile, 0o600);
  return { hostProfile, privateProfile, participationKey };
}

function installEnv(databaseUrl, files) {
  return {
    ...baseEnv(),
    CORRESPONDENCE_DATABASE_URL: databaseUrl,
    CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    FOUNDRY_HOST_PROFILE_FILE: files.hostProfile,
    FOUNDRY_PARTICIPATION_KEY_FILE: files.participationKey,
    FOUNDRY_PRIVATE_PROFILE_FILE: files.privateProfile,
  };
}

function optedEnv(databaseUrl, files, adminToken) {
  return {
    ...baseEnv(),
    FOUNDRY_HOST_OPT_IN: "1",
    CORRESPONDENCE_DATABASE_URL: databaseUrl,
    CORRESPONDENCE_ADMIN_TOKEN: adminToken,
    CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    CORRESPONDENCE_POOL_MAX: "1",
    CORRESPONDENCE_STORE: "postgres",
    CORRESPONDENCE_TRUST_PROXY: "0",
    CORRESPONDENCE_CORS_ORIGINS: "https://neomorphic.io",
    FOUNDRY_HOST_PROFILE_FILE: files.hostProfile,
    FOUNDRY_PARTICIPATION_KEY_FILE: files.participationKey,
  };
}

async function registerVisitor(origin, directory, authority) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const configPath = `${directory}.json`;
  await writeFile(configPath, JSON.stringify({
    baseUrl: `${origin}/api/correspondence`,
    directory,
    authority,
  }), { mode: 0o600 });
  const ran = await runNode([visitor, "register", configPath], baseEnv(), receiverRoot, 30000);
  if (ran.code !== 0) throw fail(1, `visitor register failed: ${ran.stderr}`);
  return JSON.parse(ran.stdout);
}

async function authorityFrom(origin) {
  const response = await fetch(`${origin}/api/correspondence/v1/visitor-entry`, { signal: AbortSignal.timeout(8000) });
  const body = await response.json();
  if (response.status !== 200 || !body?.profile?.profileId) throw fail(1, "visitor entry profile missing");
  return {
    profileId: body.profile.profileId,
    entryTerms: body.profile.termsHash,
    contributionTerms: body.profile.contribution.binding.contributionTerms,
    scope: "synthetic-reusable-components",
  };
}

async function retention(databaseUrl, candidateId) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const row = await client.query(
      `SELECT
         (SELECT charged FROM pilot_correspondence.correspondence_vf10_installation) AS charged,
         (SELECT count(*)::int FROM pilot_correspondence.correspondence_projects) AS projects,
         (SELECT count(*)::int FROM pilot_correspondence.correspondence_vf04_publications
           WHERE state = 'published' AND candidate_id = $1) AS published`,
      [candidateId],
    );
    return {
      charged: row.rows[0].charged,
      projects: row.rows[0].projects,
      published: row.rows[0].published,
    };
  } finally {
    await client.end();
  }
}

function acceptPhase(observation, requirement) {
  const judged = requireFact(observation, requirement);
  if (!judged.ok) throw fail(judged.exitCode, `${requirement} ${judged.code} ${judged.reason}`);
  return { requirement, exitCode: judged.exitCode, code: judged.code, facts: judged.facts };
}

function seededFalseGreen() {
  const ran = spawnSync(process.execPath, [acceptCli, "--fixture", falseGreen], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  let body = null;
  try { body = JSON.parse(ran.stdout); } catch { body = null; }
  if (ran.status !== 2 || body?.code !== "false_green_rejected") {
    throw fail(1, `seeded false green was not rejected: exit ${ran.status}`);
  }
  return { exitCode: ran.status, code: body.code, reason: body.reason };
}

export async function runLocalJourney() {
  assertHold();
  if (!existsSync(runtimePython)) {
    const setup = spawnSync("python3", ["vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/setup-runtime.py"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (setup.status !== 0) throw fail(1, `wasmtime runtime setup failed: ${redact(setup.stderr || "")}`);
  }
  const seeded = seededFalseGreen();
  const expected = cases[0].expected;
  const heldoutCase = cases[0].id;
  const pgCluster = await startDisposablePg();
  const dir = await mkdtemp(path.join(tmpdir(), "sds-foundry-activate-"));
  const adminToken = `local-${randomBytes(18).toString("hex")}`;
  let server = null;
  const phases = {};
  try {
    const files = await writeInputs(dir);
    server = await boot(baseEnv());
    const disabledObs = await observeOrigin(server.origin);
    phases.disabled = acceptPhase(disabledObs, "disabled");
    if (phases.disabled.facts.hostedDiscovery || phases.disabled.facts.taskResult || phases.disabled.facts.durableRetrieval) {
      throw fail(2, "disabled mount classified as foundry success");
    }
    await server.stop();
    server = null;

    const migrated = await runNode(
      ["server/foundry/install.mjs", "--migrate", "--install"],
      installEnv(pgCluster.url, files),
      repoRoot,
    );
    if (migrated.code !== 0) throw fail(1, `install failed: ${migrated.stderr}`);
    const installed = JSON.parse(migrated.stdout);
    const repeat = await runNode(
      ["server/foundry/install.mjs", "--migrate", "--install"],
      installEnv(pgCluster.url, files),
      repoRoot,
    );
    if (repeat.code !== 0) throw fail(1, `repeat install failed: ${repeat.stderr}`);
    const repeated = JSON.parse(repeat.stdout);
    if (installed.installed !== true || installed.schema !== "pilot_correspondence") throw fail(1, "installer evidence incomplete");
    if (installed.charged !== 0 || repeated.charged !== 0 || repeated.termsHash !== installed.termsHash) {
      throw fail(1, "repeat install changed charged count or terms");
    }
    const installer = {
      installed: true,
      schema: installed.schema,
      startupMigrates: false,
      chargedBeforeVisitors: installed.charged,
      repeatTermsStable: true,
    };

    server = await boot(optedEnv(pgCluster.url, files, adminToken));
    const discoveryObs = await observeOrigin(server.origin);
    phases.discovery = acceptPhase(discoveryObs, "discovery");
    if (phases.discovery.facts.taskResult || phases.discovery.facts.durableRetrieval || phases.discovery.facts.disabledOptionalMount) {
      throw fail(2, "discovery phase collapsed into another state");
    }
    const authority = await authorityFrom(server.origin);
    const visitorA = path.join(dir, "visitor-a");
    const registered = await registerVisitor(server.origin, visitorA, authority);
    const projectId = registered.body?.projectId;
    if (registered.body?.receiver?.state !== "ready" || typeof projectId !== "string") {
      throw fail(1, "cold visitor did not receive a ready receiver");
    }
    const taskPath = path.join(dir, "contribute-task.json");
    await writeFile(taskPath, JSON.stringify(original()), { mode: 0o600 });
    const contributed = await runNode(
      [visitor, "contribute", `${visitorA}.json`, taskPath],
      baseEnv(),
      receiverRoot,
    );
    if (contributed.code !== 0) throw fail(1, `contribute failed: ${contributed.stderr}`);
    const candidateId = JSON.parse(contributed.stdout)?.submission?.admission?.candidateId;
    if (typeof candidateId !== "string" || !candidateId) throw fail(1, "contribution did not return a candidate");
    const verified = await runNode(
      ["server/foundry/worker.mjs", "dispatch", projectId],
      {
        ...baseEnv(),
        FOUNDRY_HOST_OPT_IN: "1",
        CORRESPONDENCE_DATABASE_URL: pgCluster.url,
        CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
      },
      repoRoot,
    );
    if (verified.code !== 0) throw fail(1, `worker dispatch failed: ${verified.stderr}`);
    const published = await runNode(["--input-type=module", "-e", `
      import { IntegrationStore } from "./scripts/visitor-foundry/integration/src/store.mjs";
      const store = new IntegrationStore(process.env.CORRESPONDENCE_DATABASE_URL, { schema: process.env.CORRESPONDENCE_PG_SCHEMA, poolMax: 1 });
      try { console.log(JSON.stringify(await store.publish(process.env.FOUNDRY_PUBLISH_PROJECT, process.env.FOUNDRY_PUBLISH_CANDIDATE))); }
      finally { await store.close(); }
    `], {
      ...baseEnv(),
      CORRESPONDENCE_DATABASE_URL: pgCluster.url,
      CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
      FOUNDRY_PUBLISH_PROJECT: projectId,
      FOUNDRY_PUBLISH_CANDIDATE: candidateId,
    }, receiverRoot);
    if (published.code !== 0) throw fail(1, `publish failed: ${published.stderr}`);
    if (JSON.parse(published.stdout).published !== true) throw fail(1, "candidate was not published");
    const usePath = path.join(dir, "use-task.json");
    await writeFile(usePath, JSON.stringify(task(cases[0].input)), { mode: 0o600 });
    const used = await runNode([visitor, "use", `${visitorA}.json`, usePath], baseEnv(), receiverRoot);
    if (used.code !== 0) throw fail(1, `cold use failed: ${used.stderr}`);
    const output = JSON.parse(used.stdout)?.invocation?.output;
    const taskObs = {
      ...discoveryObs,
      task: { published: true, candidateId, output, expected },
      retrieval: null,
    };
    phases.task = {
      ...acceptPhase(taskObs, "task"),
      heldoutCase,
      outputOutcome: output?.outcome ?? null,
    };
    if (phases.task.facts.durableRetrieval) throw fail(2, "task result counted as durable before restart");
    await server.stop();
    server = null;

    const retained = await retention(pgCluster.url, candidateId);
    server = await boot(optedEnv(pgCluster.url, files, adminToken));
    const afterRestart = await observeOrigin(server.origin);
    const visitorB = path.join(dir, "visitor-b");
    const second = await registerVisitor(server.origin, visitorB, authority);
    if (second.body?.receiver?.state !== "ready" || second.body.projectId === projectId) {
      throw fail(1, "restarted visitor did not receive a distinct ready receiver");
    }
    const retrieved = await runNode([visitor, "use", `${visitorB}.json`, usePath], baseEnv(), receiverRoot);
    if (retrieved.code !== 0) throw fail(1, `durable use failed: ${retrieved.stderr}`);
    const retrievedOutput = JSON.parse(retrieved.stdout)?.invocation?.output;
    const still = await retention(pgCluster.url, candidateId);
    const retrievalObs = {
      ...afterRestart,
      task: taskObs.task,
      retrieval: {
        processRestarted: true,
        databaseSurvived: still.published === 1 && still.charged >= 1 && still.projects >= 1,
        sameCandidate: still.published === 1 && retained.published === 1,
        output: retrievedOutput,
      },
    };
    phases.retrieval = acceptPhase(retrievalObs, "durable");
    if (!phases.retrieval.facts.hostedDiscovery || !phases.retrieval.facts.taskResult) {
      throw fail(2, "durable retrieval dropped discovery or task result");
    }
    await server.stop();
    server = null;

    server = await boot(baseEnv());
    const rolled = await observeOrigin(server.origin);
    phases.rollback = acceptPhase(rolled, "disabled");
    const afterRollback = await retention(pgCluster.url, candidateId);
    const rowsRetained = afterRollback.published === 1 && afterRollback.charged >= 2 && afterRollback.projects >= 2;
    if (!rowsRetained) throw fail(1, "rollback dropped correspondence rows");
    if (phases.rollback.facts.hostedDiscovery || phases.rollback.facts.durableRetrieval) {
      throw fail(2, "rolled-back mount still serves foundry success");
    }
    phases.rollback.rowsRetained = true;
    phases.rollback.schemaDropped = false;
    phases.rollback.httpServesFoundry = false;
    await server.stop();
    server = null;

    const preconditions = assessPreconditions({
      ...optedEnv(pgCluster.url, files, adminToken),
      FOUNDRY_PRIVATE_PROFILE_FILE: files.privateProfile,
      FOUNDRY_PRODUCTION_ACTIVATE: "HOLD",
    }, { installer });
    if (preconditions.productionReady !== false || preconditions.productionActivate !== "HOLD") {
      throw fail(2, "local journey reported production ready");
    }
    return {
      ok: true,
      productionActivate: "HOLD",
      productionReady: false,
      hostingerMeasured: false,
      launchedService: false,
      serviceClass: "local-disposable",
      startupMigrates: false,
      schemaDropped: false,
      evidence: {
        i23: evidence.i23ClientEvidence,
        receiverHead: evidence.canonicalRuntime.receiverHead,
        sourceCommit: evidence.canonicalRuntime.sourceCommit,
      },
      preconditions: {
        productionActivate: preconditions.productionActivate,
        productionReady: preconditions.productionReady,
        shapeComplete: preconditions.shapeComplete,
        shapeBlockers: preconditions.shapeBlockers,
        blockers: preconditions.blockers,
        startupMigrates: false,
        destructiveDownMigration: false,
        schema: preconditions.schema,
      },
      seededFalseGreen: seeded,
      phases,
      demonstrated: {
        disabledOptionalMount: phases.disabled.facts.disabledOptionalMount === true && phases.rollback.facts.disabledOptionalMount === true,
        hostedDiscovery: phases.discovery.facts.hostedDiscovery === true,
        taskResult: phases.task.facts.taskResult === true,
        durableRetrieval: phases.retrieval.facts.durableRetrieval === true,
        rollbackToDisabledMount: phases.rollback.facts.disabledOptionalMount === true && rowsRetained,
      },
    };
  } finally {
    if (server) await server.stop().catch(() => {});
    await pgCluster.stop().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}
