#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { foundryHostOptIn } from "@neomorphic/correspondence";
import { runPhasedWorker } from "./lifecycle.js";

function redact(text) {
  return String(text).replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://<redacted>");
}

function fail(code, error) {
  console.error(JSON.stringify({ error }));
  process.exit(code);
}

function resolvePass(env) {
  if (env.FOUNDRY_WORKER_PASS && existsSync(env.FOUNDRY_WORKER_PASS)) return env.FOUNDRY_WORKER_PASS;
  if (env.FOUNDRY_F93_ROOT) {
    const candidate = path.join(env.FOUNDRY_F93_ROOT, "scripts/visitor-foundry/integration/worker.mjs");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function childEnv(env) {
  return {
    PATH: env.PATH || "",
    HOME: env.HOME || "",
    LANG: "C",
    LC_ALL: "C",
    NODE_ENV: env.NODE_ENV || "production",
    FOUNDRY_HOST_OPT_IN: "1",
    VF04_OWNER_QA_WORKER: "1",
    CORRESPONDENCE_DATABASE_URL: env.CORRESPONDENCE_DATABASE_URL,
    CORRESPONDENCE_PG_SCHEMA: env.CORRESPONDENCE_PG_SCHEMA,
    CORRESPONDENCE_POOL_MAX: "2",
    FOUNDRY_WORKER_TRACE: env.FOUNDRY_WORKER_TRACE || "",
    FOUNDRY_WORKER_HOLD: env.FOUNDRY_WORKER_HOLD || "",
  };
}

function spawnPass(pass, phase, projectId, shouldStop) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [pass, phase, projectId], {
      env: childEnv(process.env),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (buf) => { stderr = (stderr + redact(buf.toString())).slice(-2000); });
    child.stdout.on("data", (buf) => process.stdout.write(buf));
    const watch = setInterval(() => {
      if (shouldStop()) child.kill("SIGTERM");
    }, 30);
    const grace = setTimeout(() => child.kill("SIGKILL"), 8000);
    child.once("error", (error) => {
      clearInterval(watch);
      clearTimeout(grace);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearInterval(watch);
      clearTimeout(grace);
      if (shouldStop()) return resolve({ code, signal, stopped: true });
      if (code === 0) return resolve({ code, signal, stopped: false });
      const error = new Error(stderr || `worker ${phase} exited ${code ?? signal}`);
      error.code = "worker_failed";
      reject(error);
    });
  });
}

let optedIn = false;
try {
  optedIn = foundryHostOptIn(process.env);
} catch {
  fail(2, "foundry_opt_in_invalid");
}
if (!optedIn) fail(2, "foundry_opt_in_required");

const [mode, projectId] = process.argv.slice(2);
if (!process.env.CORRESPONDENCE_DATABASE_URL || !process.env.CORRESPONDENCE_PG_SCHEMA) {
  fail(2, "database_and_schema_required");
}
const pass = resolvePass(process.env);
if (!pass) fail(3, "layout_unavailable");

try {
  const result = await runPhasedWorker({
    mode,
    projectId,
    notify: (onStop) => {
      const handler = () => onStop();
      process.on("SIGTERM", handler);
      process.on("SIGINT", handler);
      return () => {
        process.off("SIGTERM", handler);
        process.off("SIGINT", handler);
      };
    },
    runPhase: (phase, ctx) => spawnPass(pass, phase, projectId, ctx.shouldStop),
  });
  console.log(JSON.stringify({ ok: true, ...result }));
  process.exit(result.stopped ? 0 : 0);
} catch (error) {
  const code = error.code === "worker_usage" ? 2 : 1;
  fail(code, error.code || "worker_failed");
}
