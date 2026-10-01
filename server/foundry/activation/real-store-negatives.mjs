#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { startDisposablePg } from "../../scripts/fixtures/disposable-pg.mjs";
import { mountCorrespondence } from "../../lib/correspondence-mount.js";
import { factsFrom } from "./classify.mjs";
import { REUSE_CLASS } from "../product-isolation.js";
import { HOST_WITHHOLD_CLASS, judgeHostLaunch, UNENROLLED_CLASS } from "./host-config.mjs";
import { bootFoundryServer, redact } from "./local-journey.mjs";
import { observeOrigin } from "./observe.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const receiverRoot = path.join(repoRoot, "vendor/visitor-foundry-receiver");
const selfPath = fileURLToPath(import.meta.url);
const SENTINEL = "not-a-real-secret";
const PRODUCT_URL = `postgres://pilot:${SENTINEL}@db.arvmcttdegqwiwdaembr.supabase.co:5432/postgres`;

const FIXTURES = {
  "product-reuse": ["server/foundry/activation/delta.mjs", "server/foundry/activation/fixtures/seeded-product-reuse.json", REUSE_CLASS],
  "product-reuse-pooler": ["server/foundry/activation/delta.mjs", "server/foundry/activation/fixtures/seeded-product-reuse-pooler.json", REUSE_CLASS],
  "product-reuse-flag": ["server/foundry/activation/delta.mjs", "server/foundry/activation/fixtures/seeded-product-reuse-flag.json", REUSE_CLASS],
  "product-reuse-supabase-url": ["server/foundry/activation/delta.mjs", "server/foundry/activation/fixtures/seeded-product-reuse-supabase-url.json", REUSE_CLASS],
  "secret-metadata": ["server/foundry/activation/delta.mjs", "server/foundry/activation/fixtures/seeded-secret-metadata.json", "false_green_rejected", "secret_material"],
  "secret-nested": ["server/foundry/activation/delta.mjs", "server/foundry/activation/fixtures/seeded-secret-nested.json", "false_green_rejected", "secret_material"],
  "client-false-green": ["server/foundry/activation/client-compat.mjs", "server/foundry/activation/fixtures/seeded-client-false-green.json", "false_green_rejected", "client_surfaces_are_not_portable_interop"],
  "client-catalog-false-green": ["server/foundry/activation/client-compat.mjs", "server/foundry/activation/fixtures/seeded-client-catalog-false-green.json", "false_green_rejected", "client_surfaces_are_not_portable_interop"],
  "host-withhold-fixture": ["server/foundry/activation/postdeploy-accept.mjs", "server/foundry/activation/fixtures/seeded-host-withhold.json", HOST_WITHHOLD_CLASS],
  "unenrolled-fixture": ["server/foundry/activation/postdeploy-accept.mjs", "server/foundry/activation/fixtures/seeded-unenrolled-hosted-success.json", UNENROLLED_CLASS],
};

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  return process.argv[index + 1] || null;
}

function emit(result) {
  const text = JSON.stringify(result);
  if (text.includes(SENTINEL) || /postgres(?:ql)?:\/\//i.test(text)) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      exitCode: 1,
      code: "secret_in_stdout",
      productionActivate: "HOLD",
      productionReady: false,
      launchedService: false,
    })}\n`);
    process.exit(1);
  }
  process.stdout.write(`${text}\n`);
  process.exit(result.exitCode ?? (result.ok ? 0 : 1));
}

function hold(code, reason = code, extra = {}) {
  return {
    ok: false,
    exitCode: extra.exitCode ?? 2,
    code,
    class: code,
    reason,
    productionActivate: "HOLD",
    productionReady: false,
    launchedService: false,
    secretsCopied: false,
    ...extra,
  };
}

function cleanEnv(extra = {}) {
  return {
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || "",
    LANG: "C",
    LC_ALL: "C",
    NODE_ENV: "production",
    PORT: "0",
    ...extra,
  };
}

function runNode(args, env) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    env,
    encoding: "utf8",
    timeout: 30000,
  });
}

function fixtureCase(name) {
  const [script, fixture, code, reason] = FIXTURES[name];
  const ran = runNode([script, "--fixture", fixture], cleanEnv());
  const combined = `${ran.stdout || ""}${ran.stderr || ""}`;
  if (combined.includes(SENTINEL)) return hold("secret_in_stdout", "secret_in_stdout", { exitCode: 1 });
  let body = null;
  try { body = JSON.parse(ran.stdout); } catch { body = null; }
  if (ran.status !== 2 || body?.code !== code || (reason && body?.reason !== reason)) {
    return hold("negative_not_rejected", name, {
      exitCode: 1,
      status: ran.status,
      observedCode: body?.code ?? null,
      observedReason: body?.reason ?? null,
    });
  }
  return hold(code, body.reason || code, {
    case: name,
    signals: body.signals || undefined,
    missing: body.missing || undefined,
  });
}

async function productReuseRuntime() {
  let connected = false;
  const app = express();
  const handle = mountCorrespondence(app, {
    env: cleanEnv({
      FOUNDRY_HOST_OPT_IN: "1",
      CORRESPONDENCE_DATABASE_URL: PRODUCT_URL,
      CORRESPONDENCE_ADMIN_TOKEN: "x".repeat(24),
      CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
      CORRESPONDENCE_STORE: "postgres",
      SUPABASE_URL: "https://arvmcttdegqwiwdaembr.supabase.co",
    }),
    loadService: async () => {
      connected = true;
      throw new Error("must not connect");
    },
  });
  await handle.ready();
  const detail = handle.state.reason;
  await handle.close();
  const install = runNode(["server/foundry/install.mjs", "--migrate"], cleanEnv({
    CORRESPONDENCE_DATABASE_URL: PRODUCT_URL,
    CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    SUPABASE_URL: "https://arvmcttdegqwiwdaembr.supabase.co",
  }));
  const worker = runNode(["server/foundry/worker.mjs", "dispatch", "prj_negative"], cleanEnv({
    FOUNDRY_HOST_OPT_IN: "1",
    CORRESPONDENCE_DATABASE_URL: PRODUCT_URL,
    CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
  }));
  const blob = `${install.stdout}${install.stderr}${worker.stdout}${worker.stderr}`;
  if (connected || blob.includes(SENTINEL) || /postgres(?:ql)?:\/\//i.test(blob) || /ECONN|ENOTFOUND|password authentication/i.test(blob)) {
    return hold("secret_in_stdout", "runtime_reused_or_connected", { exitCode: 1, connected });
  }
  if (detail !== "invalid_config" || install.status !== 2 || worker.status !== 2) {
    return hold("negative_not_rejected", "product_reuse_runtime", {
      exitCode: 1,
      detail,
      installStatus: install.status,
      workerStatus: worker.status,
    });
  }
  if (!install.stderr.includes(REUSE_CLASS) || !worker.stderr.includes(REUSE_CLASS)) {
    return hold("negative_not_rejected", "class_missing", { exitCode: 1 });
  }
  return hold(REUSE_CLASS, REUSE_CLASS, { connected: false, installExit: 2, workerExit: 2 });
}

async function observeSettled(origin) {
  let previous = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const observation = await observeOrigin(origin);
    const reason = observation.correspondenceHealthz?.body?.reason;
    const enabled = observation.correspondenceHealthz?.body?.enabled === true;
    if (enabled || reason === "invalid_config" || reason === "store_unavailable") return observation;
    if (previous && reason === "unconfigured") return observation;
    previous = observation;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return previous;
}

async function writeInputs(dir) {
  const hostProfile = path.join(dir, "host-profile.json");
  const participationKey = path.join(dir, "participation.key");
  await copyFile(path.join(receiverRoot, "scripts/visitor-foundry/integration/entry/host-profile.example.json"), hostProfile);
  await writeFile(participationKey, `${randomBytes(24).toString("hex")}\n`, { mode: 0o600 });
  await chmod(hostProfile, 0o600);
  return { hostProfile, participationKey };
}

function summarizeBoot(label, observation) {
  const facts = factsFrom(observation);
  return {
    label,
    enabled: observation.correspondenceHealthz?.body?.enabled === true,
    reason: observation.correspondenceHealthz?.body?.reason ?? null,
    hostedDiscovery: facts.hostedDiscovery,
    durableRetrieval: facts.durableRetrieval,
    facade: observation.foundryReceiver?.body?.facade === true,
  };
}

async function bootAndObserve(env) {
  const server = await bootFoundryServer(env);
  try {
    return await observeSettled(server.origin);
  } finally {
    await server.stop();
  }
}

async function hostWithhold() {
  const boots = [];
  const missingAll = await bootAndObserve(cleanEnv());
  boots.push(summarizeBoot("all_missing", missingAll));
  const optInOnly = await bootAndObserve(cleanEnv({ FOUNDRY_HOST_OPT_IN: "1" }));
  boots.push(summarizeBoot("opt_in_only", optInOnly));
  const pgCluster = await startDisposablePg();
  const dir = await mkdtemp(path.join(tmpdir(), "sds-foundry-withhold-"));
  try {
    const token = `local-${randomBytes(18).toString("hex")}`;
    const withoutOptIn = cleanEnv({
      CORRESPONDENCE_DATABASE_URL: pgCluster.url,
      CORRESPONDENCE_ADMIN_TOKEN: token,
      CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
      CORRESPONDENCE_POOL_MAX: "1",
      CORRESPONDENCE_STORE: "postgres",
    });
    const observed = await bootAndObserve(withoutOptIn);
    const summary = summarizeBoot("url_token_without_opt_in", observed);
    boots.push(summary);
    if (boots.some((boot) => boot.hostedDiscovery || boot.durableRetrieval || boot.facade)) {
      return hold("false_green_rejected", "service_became_ready", { exitCode: 1, boots });
    }
    const claim = {
      ...observed,
      productionActivate: "HOLD",
      claims: { hostedDiscovery: true, launchedService: true, productionReady: true, durableRetrieval: true },
    };
    const judged = judgeHostLaunch(claim, withoutOptIn);
    if (!judged.rejected || judged.code !== HOST_WITHHOLD_CLASS) {
      return hold("negative_not_rejected", "host_withhold", { exitCode: 1, boots });
    }
    if (boots[0].reason !== "unconfigured" || boots[0].enabled !== false) {
      return hold("negative_not_rejected", "all_missing", { exitCode: 1, boots });
    }
    if (boots[1].reason !== "invalid_config" || boots[1].enabled !== false) {
      return hold("negative_not_rejected", "opt_in_only", { exitCode: 1, boots });
    }
    return hold(HOST_WITHHOLD_CLASS, HOST_WITHHOLD_CLASS, {
      missing: ["FOUNDRY_HOST_OPT_IN", "CORRESPONDENCE_DATABASE_URL", "CORRESPONDENCE_ADMIN_TOKEN"],
      boots,
    });
  } finally {
    await pgCluster.stop().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}

async function unenrolledStore() {
  const pgCluster = await startDisposablePg();
  const dir = await mkdtemp(path.join(tmpdir(), "sds-foundry-unenrolled-"));
  try {
    const files = await writeInputs(dir);
    const token = `local-${randomBytes(18).toString("hex")}`;
    const env = cleanEnv({
      FOUNDRY_HOST_OPT_IN: "1",
      CORRESPONDENCE_DATABASE_URL: pgCluster.url,
      CORRESPONDENCE_ADMIN_TOKEN: token,
      CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
      CORRESPONDENCE_POOL_MAX: "1",
      CORRESPONDENCE_STORE: "postgres",
      CORRESPONDENCE_TRUST_PROXY: "0",
      CORRESPONDENCE_CORS_ORIGINS: "https://neomorphic.io",
      FOUNDRY_HOST_PROFILE_FILE: files.hostProfile,
      FOUNDRY_PARTICIPATION_KEY_FILE: files.participationKey,
    });
    const observed = await bootAndObserve(env);
    const summary = summarizeBoot("opt_in_without_installer", observed);
    if (summary.hostedDiscovery || summary.durableRetrieval || summary.facade || summary.enabled) {
      return hold("unenrolled_store_became_ready", "service_became_ready", { exitCode: 1, boot: summary });
    }
    const judged = judgeHostLaunch({
      ...observed,
      enrolledRealStore: false,
      productionActivate: "HOLD",
      claims: { hostedDiscovery: true, durableRetrieval: true, launchedService: true, productionReady: true },
    }, env);
    if (judged.rejected) {
      return hold("negative_not_rejected", "host_config_should_be_present", { exitCode: 1, boot: summary });
    }
    return hold(UNENROLLED_CLASS, UNENROLLED_CLASS, { enrolledRealStore: false, boot: summary });
  } finally {
    await pgCluster.stop().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}

function proveAll() {
  const cases = [
    ...Object.keys(FIXTURES),
    "product-reuse-runtime",
    "host-withhold",
    "unenrolled-store",
  ];
  const results = [];
  for (const name of cases) {
    const ran = spawnSync(process.execPath, [selfPath, "--case", name], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 180000,
      env: cleanEnv(),
    });
    const combined = `${ran.stdout || ""}${ran.stderr || ""}`;
    if (combined.includes(SENTINEL) || /postgres(?:ql)?:\/\/\S+@/i.test(combined)) {
      emit(hold("secret_in_stdout", name, { exitCode: 1 }));
    }
    let body = null;
    try { body = JSON.parse(ran.stdout); } catch { body = null; }
    results.push({
      case: name,
      exitCode: ran.status,
      code: body?.code ?? null,
      class: body?.class ?? null,
      productionActivate: body?.productionActivate ?? null,
      productionReady: body?.productionReady ?? null,
    });
    if (ran.status !== 2 || body?.productionActivate !== "HOLD" || body?.productionReady !== false) {
      emit({
        ok: false,
        exitCode: 1,
        code: "negative_not_rejected",
        reason: name,
        productionActivate: "HOLD",
        productionReady: false,
        launchedService: false,
        results,
      });
    }
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    exitCode: 0,
    code: "real_store_negatives_rejected",
    productionActivate: "HOLD",
    productionReady: false,
    launchedService: false,
    secretsCopied: false,
    results,
  })}\n`);
  process.exit(0);
}

const invoked = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  try {
    const name = argument("--case");
    if (!name || name === "prove") proveAll();
    if (FIXTURES[name]) emit(fixtureCase(name));
    if (name === "product-reuse-runtime") emit(await productReuseRuntime());
    if (name === "host-withhold") emit(await hostWithhold());
    if (name === "unenrolled-store") emit(await unenrolledStore());
    emit(hold("unknown_case", name, { exitCode: 2 }));
  } catch (error) {
    emit(hold("negative_not_rejected", "exception", {
      exitCode: 1,
      detail: redact(error instanceof Error ? error.message : error),
    }));
  }
}
