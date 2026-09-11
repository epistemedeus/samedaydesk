import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { pythonCli, d01Cli, d07Cli, prefixLayout } from "./install.mjs";

const ENGINE_TIMEOUT_MS = 120_000;

export function isolatedEnv(prefix, extra = {}) {
  const path = process.env.PATH || "/usr/bin:/bin";
  const layout = prefixLayout(prefix);
  const env = { ...process.env };
  delete env.SAMEDAYDESK_ROOT;
  delete env.NODE_PATH;
  env.PYTHONNOUSERSITE = "1";
  env.PYTHONPATH = layout.pythonSrc;
  env.PATH = `${layout.bin}:${dirname(process.execPath)}:${path}`;
  env.TMPDIR = layout.work;
  Object.assign(env, extra);
  delete env.SAMEDAYDESK_ROOT;
  return env;
}

export function parseJsonStdout(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function runProcess(command, args, { cwd, env, timeoutMs = ENGINE_TIMEOUT_MS } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    status: result.status,
    signal: result.signal || null,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : null,
    json: parseJsonStdout(result.stdout),
  };
}

export function runPythonCli(prefix, args, extra = {}) {
  const layout = prefixLayout(prefix);
  return runProcess(pythonCli(prefix), args, {
    cwd: layout.work,
    env: isolatedEnv(prefix, extra.env),
    timeoutMs: extra.timeoutMs,
  });
}

export function runD01Cli(prefix, args, extra = {}) {
  const layout = prefixLayout(prefix);
  return runProcess(process.execPath, [d01Cli(prefix), ...args], {
    cwd: layout.d01,
    env: isolatedEnv(prefix, extra.env),
    timeoutMs: extra.timeoutMs,
  });
}

export function runD07Cli(prefix, args, extra = {}) {
  const layout = prefixLayout(prefix);
  return runProcess(process.execPath, [d07Cli(prefix), ...args], {
    cwd: layout.d07,
    env: isolatedEnv(prefix, extra.env),
    timeoutMs: extra.timeoutMs,
  });
}

export function classifyConsumerOutcome(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      transport: "engine-crash",
      analysis: "not-run",
      useful: false,
      reason: "missing-json",
    };
  }
  if (payload.transport) {
    const analysis = payload.analysis?.outcome || payload.analysis?.status || payload.analysis || "not-run";
    const complete = payload.delivery?.complete === true;
    const useful =
      payload.transport === "ok" &&
      complete &&
      (payload.ok === true || analysis === "informational" || analysis === "refused" || analysis === "completed" || analysis === "actionable");
    return {
      transport: payload.transport,
      analysis,
      useful: payload.ok === true && complete,
      validDomainRefusal: payload.transport === "ok" && (analysis === "informational" || analysis === "refused"),
      contract: payload.contract || null,
    };
  }
  if (payload.refused === true || payload.ok === false) {
    return {
      transport: payload.extracted === false ? "acquisition-failed" : "rejected",
      analysis: payload.executed ? "refused" : "not-run",
      useful: false,
      code: payload.code || null,
    };
  }
  return {
    transport: "ok",
    analysis: payload.sample ? "sample" : "completed",
    useful: payload.ok === true && payload.outputsExist !== false,
    code: null,
  };
}
