import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { classifyEngineLifecycle } from "./classify.mjs";
import { PINNED_IMPLEMENTATION, SCHEMA } from "./contract.mjs";
import {
  copyRefusedEvidence,
  deleteCliKeepReady,
  extractKit,
  killIsolateProcesses,
  killPidFile,
  makeCachePathAFile,
  makeCliADirectory,
  replaceAppCli,
  replaceKitCli,
  wipeKitCache,
} from "./kit.mjs";
import {
  CALLER_BUDGET_AFTER,
  CALLER_BUDGET_BEFORE,
  ENGINE_LIB,
  REPO_ROOT,
  WRAPPER_CLI,
  WRAPPER_LIB,
} from "./paths.mjs";

const BUDGET_JOB = "vendor-budget-impact";
const BUDGET_INPUTS = { before: CALLER_BUDGET_BEFORE, after: CALLER_BUDGET_AFTER };

function budgetFlags() {
  return ["--before", CALLER_BUDGET_BEFORE, "--after", CALLER_BUDGET_AFTER];
}

export function spawnWrapperCli({ jobId, flags, timeoutMs = 60_000 }) {
  return spawnSync(process.execPath, [WRAPPER_CLI, "run", jobId, ...flags], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    env: process.env,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function parseWrapperBody(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function spawnMeta(r, timedOut = false) {
  return {
    status: r.status,
    signal: r.signal || null,
    errorCode: r.error?.code || null,
    stderr: r.stderr || "",
    timedOut: timedOut || r.error?.code === "ETIMEDOUT",
  };
}

async function loadPaid() {
  const engine = await import(ENGINE_LIB);
  const wrapper = await import(WRAPPER_LIB);
  return { ...engine, ...wrapper };
}

async function observeOffer(jobId, request, timeoutMs = 60_000) {
  const { runEngineJob, runPaidOffer } = await loadPaid();
  const engine = runEngineJob(jobId, { files: request.inputs, timeoutMs });
  let threw = null;
  let wrapper = null;
  try {
    wrapper = await runPaidOffer(request);
  } catch (err) {
    threw = { message: err.message, code: err.code, name: err.name };
  }
  return { engine, wrapper, threw };
}

function classifiedOffer(observed, requiredOutputCount = 2, spawnOverride) {
  return classifyEngineLifecycle({
    threw: observed.threw,
    wrapper: observed.wrapper,
    spawn: spawnOverride || {
      status: observed.engine.status,
      signal: null,
      errorCode: null,
      stderr: observed.engine.stderr || "",
      timedOut: false,
    },
    engineStdout: observed.engine.stdout || "",
    requiredOutputCount,
  });
}

function classifiedCli(r, wrapper, requiredOutputCount, extraSpawn = {}) {
  const engineStdout =
    wrapper?.ok === true
      ? JSON.stringify(wrapper.engine || {})
      : wrapper?.engine?.stdout || r.stdout || "";
  const spawn = {
    ...spawnMeta(r),
    status: wrapper?.ok === true ? 0 : wrapper?.engine?.status ?? r.status,
    ...extraSpawn,
  };
  return classifyEngineLifecycle({
    wrapper,
    spawn,
    engineStdout,
    requiredOutputCount,
  });
}

export const CASE_IDS = [
  "positive",
  "stub-ok-true-no-outputs",
  "decoy-json",
  "nonzero-exit",
  "invalid-json",
  "empty-stdout",
  "ok-false-json",
  "stderr-json",
  "cli-is-directory",
  "install-cache-is-file",
  "engine-timeout",
  "wrapper-cli-hang",
  "grandchild-timeout-orphan",
  "delete-cli-reextract",
  "domain-refused",
];

export async function runCase(id, { isolate, pidFile }) {
  const { cacheRoot } = await loadPaid();
  wipeKitCache(cacheRoot());
  killPidFile(pidFile);

  const budgetRequest = { jobId: BUDGET_JOB, inputs: BUDGET_INPUTS };
  let report;

  try {
    if (id === "positive") {
      const r = spawnWrapperCli({ jobId: BUDGET_JOB, flags: budgetFlags() });
      const wrapper = parseWrapperBody(r.stdout);
      report = {
        via: "wrapper-cli",
        wrapper,
        classification: classifiedCli(r, wrapper, 2),
        cliExit: r.status,
      };
    } else if (id === "stub-ok-true-no-outputs") {
      await replaceKitCli("ok-true-no-outputs.mjs");
      const r = spawnWrapperCli({ jobId: BUDGET_JOB, flags: budgetFlags(), timeoutMs: 30_000 });
      const wrapper = parseWrapperBody(r.stdout);
      report = {
        via: "wrapper-cli",
        wrapper,
        classification: classifiedCli(r, wrapper, 2),
        cliExit: r.status,
      };
    } else if (id === "decoy-json") {
      await replaceKitCli("decoy-json.mjs");
      const observed = await observeOffer(BUDGET_JOB, budgetRequest);
      report = {
        via: "runPaidOffer",
        wrapper: observed.wrapper,
        engineStdout: observed.engine.stdout,
        classification: classifiedOffer(observed),
      };
    } else if (id === "nonzero-exit") {
      await replaceKitCli("nonzero.mjs");
      const observed = await observeOffer(BUDGET_JOB, budgetRequest);
      report = {
        via: "runPaidOffer",
        wrapper: observed.wrapper,
        engineStatus: observed.engine.status,
        classification: classifiedOffer(observed),
      };
    } else if (id === "invalid-json") {
      await replaceKitCli("invalid-json.mjs");
      const observed = await observeOffer(BUDGET_JOB, budgetRequest);
      report = { via: "runPaidOffer", wrapper: observed.wrapper, classification: classifiedOffer(observed) };
    } else if (id === "empty-stdout") {
      await replaceKitCli("empty-stdout.mjs");
      const observed = await observeOffer(BUDGET_JOB, budgetRequest);
      report = { via: "runPaidOffer", wrapper: observed.wrapper, classification: classifiedOffer(observed) };
    } else if (id === "ok-false-json") {
      await replaceKitCli("ok-false.mjs");
      const observed = await observeOffer(BUDGET_JOB, budgetRequest);
      report = { via: "runPaidOffer", wrapper: observed.wrapper, classification: classifiedOffer(observed) };
    } else if (id === "stderr-json") {
      await replaceKitCli("stderr-json.mjs");
      const observed = await observeOffer(BUDGET_JOB, budgetRequest);
      report = {
        via: "runPaidOffer",
        wrapper: observed.wrapper,
        engineStderr: observed.engine.stderr,
        classification: classifiedOffer(observed),
      };
    } else if (id === "cli-is-directory") {
      await makeCliADirectory();
      const observed = await observeOffer(BUDGET_JOB, budgetRequest);
      report = { via: "runPaidOffer", wrapper: observed.wrapper, classification: classifiedOffer(observed) };
    } else if (id === "install-cache-is-file") {
      await makeCachePathAFile();
      const r = spawnWrapperCli({ jobId: BUDGET_JOB, flags: budgetFlags(), timeoutMs: 15_000 });
      const wrapper = parseWrapperBody(r.stdout);
      const threw =
        wrapper == null
          ? { message: r.stderr || "uncaught", code: /EEXIST/.test(r.stderr || "") ? "EEXIST" : null }
          : null;
      report = {
        via: "wrapper-cli",
        wrapper,
        stderr: r.stderr,
        classification: classifyEngineLifecycle({
          threw,
          wrapper,
          spawn: spawnMeta(r),
          engineStdout: r.stdout,
          requiredOutputCount: 2,
        }),
        cliExit: r.status,
      };
    } else if (id === "engine-timeout") {
      await replaceKitCli("hang.mjs");
      const { runEngineJob } = await loadPaid();
      const t0 = Date.now();
      const engine = runEngineJob(BUDGET_JOB, { files: BUDGET_INPUTS, timeoutMs: 500 });
      report = {
        via: "runEngineJob",
        wrapper: null,
        elapsedMs: Date.now() - t0,
        engineStatus: engine.status,
        classification: classifyEngineLifecycle({
          wrapper: null,
          spawn: {
            status: engine.status,
            signal: null,
            errorCode: null,
            stderr: engine.stderr || "",
            timedOut: true,
          },
          engineStdout: engine.stdout,
          requiredOutputCount: 2,
        }),
      };
    } else if (id === "wrapper-cli-hang") {
      await replaceKitCli("hang.mjs");
      const r = spawnWrapperCli({ jobId: BUDGET_JOB, flags: budgetFlags(), timeoutMs: 800 });
      const wrapper = parseWrapperBody(r.stdout);
      report = {
        via: "wrapper-cli",
        wrapper,
        classification: classifyEngineLifecycle({
          wrapper,
          spawn: spawnMeta(r, true),
          engineStdout: r.stdout,
          requiredOutputCount: 2,
        }),
        cliExit: r.status,
      };
    } else if (id === "grandchild-timeout-orphan") {
      await replaceAppCli(BUDGET_JOB, "hang.mjs");
      const { runEngineJob } = await loadPaid();
      const engine = runEngineJob(BUDGET_JOB, { files: BUDGET_INPUTS, timeoutMs: 500 });
      const orphanPidFilePresent = existsSync(pidFile);
      const killed = killPidFile(pidFile);
      report = {
        via: "runEngineJob",
        wrapper: null,
        engineStatus: engine.status,
        orphanPidFilePresent,
        killed,
        classification: classifyEngineLifecycle({
          wrapper: null,
          spawn: {
            status: engine.status,
            signal: null,
            errorCode: null,
            stderr: engine.stderr || "",
            timedOut: true,
          },
          engineStdout: engine.stdout,
          requiredOutputCount: 2,
        }),
      };
    } else if (id === "delete-cli-reextract") {
      const dest = await deleteCliKeepReady();
      const r = spawnWrapperCli({ jobId: BUDGET_JOB, flags: budgetFlags() });
      const wrapper = parseWrapperBody(r.stdout);
      report = {
        via: "wrapper-cli",
        wrapper,
        cliRestored: existsSync(dest),
        classification: classifiedCli(r, wrapper, 2),
        cliExit: r.status,
      };
    } else if (id === "domain-refused") {
      await extractKit();
      const copy = `${isolate}/refused-evidence.json`;
      await copyRefusedEvidence(copy);
      const observed = await observeOffer("evidence-ci-annotation", {
        jobId: "evidence-ci-annotation",
        inputs: { input: copy },
      });
      report = {
        via: "runPaidOffer",
        wrapper: observed.wrapper,
        engineJson: observed.engine.json,
        classification: classifiedOffer(observed, 2),
      };
    } else {
      throw new Error(`unknown case ${id}`);
    }
  } finally {
    killPidFile(pidFile);
    killIsolateProcesses(isolate);
    try {
      wipeKitCache(cacheRoot());
    } catch {
      /* isolate teardown */
    }
  }

  return {
    schema: SCHEMA,
    pinnedImplementation: PINNED_IMPLEMENTATION,
    caseId: id,
    isolate,
    ...report,
  };
}
