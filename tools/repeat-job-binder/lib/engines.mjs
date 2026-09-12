import { existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { ENGINE_TIMEOUT_MS, SUPPORTED_FAMILIES } from "./pins.mjs";
import { refuse } from "./refuse.mjs";
import { prepareEmptyEngineDir } from "./freeze.mjs";
import { runWrapperJob } from "../../output-replay-harness/lib/wrapper.mjs";
import { readBoundedFile } from "./digest.mjs";

function parseJson(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function runNode(script, argv, { cwd, timeoutMs = ENGINE_TIMEOUT_MS } = {}) {
  const r = spawnSync(process.execPath, [script, ...argv], {
    encoding: "utf8",
    cwd,
    timeout: timeoutMs,
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    status: r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    json: parseJson(r.stdout),
    error: r.error ? String(r.error.message || r.error) : null,
  };
}

function existingNamedOutputs(engineDir, names) {
  return names
    .map((name) => path.join(engineDir, name))
    .filter((filePath) => existsSync(filePath));
}

export function analysisOutcomeOf(json) {
  if (!json || typeof json !== "object") return null;
  if (json.ok === false || json.refused === true || json.status === "refused") return "refused";
  if (json.status === "informational" || json.status === "no-change") return "no-change";
  if (json.status === "partial") return "partial";
  return "completed";
}

export function classifyEngineRun(engineResult, { family } = {}) {
  const spec = SUPPORTED_FAMILIES[family];
  if (!engineResult) {
    return {
      transport: "failed",
      analysisOutcome: null,
      code: "engine-failed",
      message: "engine returned no result",
    };
  }
  if (engineResult.error) {
    return {
      transport: "failed",
      analysisOutcome: null,
      code: engineResult.kind === "vendor-pin" ? "vendor-pin-engine-failed" : "catalog-engine-failed",
      message: engineResult.error,
      exitCode: engineResult.exitCode ?? null,
    };
  }
  if (engineResult.exitCode !== 0) {
    return {
      transport: "failed",
      analysisOutcome: null,
      code: "nonzero-engine-exit",
      message: "Engine exited nonzero; that is a transport failure, not an actionable analysis",
      exitCode: engineResult.exitCode,
      json: engineResult.stdout && typeof engineResult.stdout === "object" ? engineResult.stdout : engineResult.json || null,
    };
  }
  const json =
    engineResult.stdout && typeof engineResult.stdout === "object"
      ? engineResult.stdout
      : engineResult.json || null;
  if (!json) {
    return {
      transport: "failed",
      analysisOutcome: null,
      code: engineResult.kind === "vendor-pin" ? "vendor-pin-engine-failed" : "catalog-engine-failed",
      message: "engine produced no JSON",
      exitCode: engineResult.exitCode,
    };
  }
  const outputs = (engineResult.outputs || []).filter((p) => existsSync(p));
  if ((engineResult.kind === "catalog" || engineResult.kind === "d01-wrapper") && spec) {
    const missing = spec.catalogOutputs.filter(
      (name) => !outputs.some((p) => path.basename(p) === name),
    );
    if (missing.length) {
      return {
        transport: "failed",
        analysisOutcome: null,
        code: "missing-engine-outputs",
        message: "Catalog engine did not write required outputs for this run",
        missing,
      };
    }
  }
  if (engineResult.kind === "vendor-pin" && outputs.length === 0) {
    return {
      transport: "failed",
      analysisOutcome: null,
      code: "missing-engine-outputs",
      message: "Vendor-pin engine did not write a record-repeat artifact",
    };
  }
  return {
    transport: "ok",
    analysisOutcome: analysisOutcomeOf(engineResult.wrapper?.analysis || json),
    exitCode: 0,
    json,
    outputs,
  };
}

export function createAdapters(kit) {
  return {
    catalog: {
      kind: "catalog",
      async run({ family, inputs, outDir }) {
        const spec = SUPPORTED_FAMILIES[family];
        if (!spec) throw refuse("unsupported-family", "no catalog mapping", { family });
        const engineDir = prepareEmptyEngineDir(outDir);
        const argv = ["run", spec.catalogJob, "--before", inputs.before, "--after", inputs.after];
        if (spec.requiredSlots.includes("used")) argv.push("--used", inputs.used);
        argv.push("--out-dir", engineDir);
        const r = runNode(kit.usefulJobsCli, argv, { cwd: kit.usefulJobsRoot });
        const outputs = existingNamedOutputs(engineDir, spec.catalogOutputs);
        return {
          kind: "catalog",
          jobId: spec.catalogJob,
          family,
          argv,
          exitCode: r.status,
          stdout: r.json,
          json: r.json,
          error: r.error,
          stderr: r.stderr,
          outDir: engineDir,
          outputs,
        };
      },
    },
    vendorPin: {
      kind: "vendor-pin",
      async run({ family, inputs, outDir }) {
        const spec = SUPPORTED_FAMILIES[family];
        if (!spec) throw refuse("unsupported-family", "no vendor-pin mapping", { family });
        const engineDir = prepareEmptyEngineDir(outDir);
        const argv = ["run", "--family", spec.vendorPinFamily, "--before", inputs.before, "--after", inputs.after];
        if (spec.requiredSlots.includes("used") && inputs.used) argv.push("--used", inputs.used);
        const r = runNode(kit.recordRepeatBin, argv, { cwd: kit.recordRepeatRoot || kit.usefulJobsRoot });
        const reportPath = path.join(engineDir, "record-repeat.json");
        if (r.status === 0 && r.json) {
          writeFileSync(reportPath, `${JSON.stringify(r.json, null, 2)}\n`);
        }
        return {
          kind: "vendor-pin",
          jobId: "record-repeat",
          family,
          argv,
          exitCode: r.status,
          stdout: r.json,
          json: r.json,
          error: r.error,
          stderr: r.stderr,
          outDir: engineDir,
          outputs: existsSync(reportPath) ? [reportPath] : [],
          refused: Boolean(r.json?.refused),
          ok: r.json ? r.json.ok !== false && !r.json.refused : false,
        };
      },
    },
    paidWrapper: {
      kind: "d01-wrapper",
      async run({ family, inputs, outDir }) {
        const spec = SUPPORTED_FAMILIES[family];
        if (!spec) throw refuse("unsupported-family", "no catalog mapping", { family });
        if (!kit.paidWrapperBin) {
          throw refuse("missing-d01-wrapper", "paid wrapper CLI was requested but not injected", {});
        }
        const engineDir = prepareEmptyEngineDir(outDir);
        const files = Object.fromEntries(spec.requiredSlots.map((slot) => [slot, inputs[slot]]));
        const inputHashes = Object.fromEntries(Object.entries(files).map(([key, file]) => {
          const entry = readBoundedFile(file);
          return [key, { sha256: entry.sha256, bytes: entry.bytes }];
        }));
        let r;
        try {
          r = runWrapperJob(spec.catalogJob, { files, inputHashes, outDir: engineDir,
            outputNames: spec.catalogOutputs, wrapperBin: kit.paidWrapperBin });
        } catch (err) {
          throw refuse(err.code || 'wrapper-failed', err.message, err.detail || {});
        }
        return {
          kind: "d01-wrapper", jobId: spec.catalogJob, family, argv: r.args,
          exitCode: r.status, stdout: r.json.engine, json: r.json,
          wrapper: r.json, pid: r.pid, executionId: r.json.executionId,
          error: r.error, stderr: r.stderr, outDir: engineDir,
          outputs: existingNamedOutputs(engineDir, spec.catalogOutputs),
        };
      },
    },
  };
}

export async function runEngine(adapters, kind, req) {
  const key = kind === "vendor-pin" ? "vendorPin" : kind === "d01-wrapper" ? "paidWrapper" : "catalog";
  const adapter = adapters[key];
  if (!adapter) {
    throw refuse("unknown-engine", "engine must be catalog, vendor-pin, or d01-wrapper", { kind });
  }
  return adapter.run(req);
}
