import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { ENGINE_TIMEOUT_MS, SUPPORTED_FAMILIES } from "./pins.mjs";
import { refuse } from "./refuse.mjs";

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

export function createAdapters(kit) {
  return {
    catalog: {
      kind: "catalog",
      async run({ family, inputs, outDir }) {
        const spec = SUPPORTED_FAMILIES[family];
        if (!spec) throw refuse("unsupported-family", "no catalog mapping", { family });
        const engineDir = path.join(outDir, "engine");
        mkdirSync(engineDir, { recursive: true });
        const argv = ["run", spec.catalogJob, "--before", inputs.before, "--after", inputs.after];
        if (spec.requiredSlots.includes("used")) argv.push("--used", inputs.used);
        argv.push("--out-dir", engineDir);
        const r = runNode(kit.usefulJobsCli, argv, { cwd: kit.usefulJobsRoot });
        if (r.error) {
          throw refuse("catalog-engine-failed", r.error, { family, job: spec.catalogJob });
        }
        if (!r.json) {
          throw refuse("catalog-engine-failed", (r.stdout + r.stderr).slice(0, 800), {
            family,
            job: spec.catalogJob,
            status: r.status,
          });
        }
        if (r.json.ok === false || r.json.refused === true) {
          throw refuse("catalog-engine-refused", r.json.error || "catalog job refused", {
            nested: r.json,
            job: spec.catalogJob,
          });
        }
        return {
          kind: "catalog",
          jobId: spec.catalogJob,
          family,
          argv,
          exitCode: r.status,
          stdout: r.json,
          outDir: engineDir,
          outputs: spec.catalogOutputs.map((name) => path.join(engineDir, name)),
        };
      },
    },
    vendorPin: {
      kind: "vendor-pin",
      async run({ family, inputs, outDir }) {
        const spec = SUPPORTED_FAMILIES[family];
        if (!spec) throw refuse("unsupported-family", "no vendor-pin mapping", { family });
        const engineDir = path.join(outDir, "engine");
        mkdirSync(engineDir, { recursive: true });
        const argv = ["run", "--family", spec.vendorPinFamily, "--before", inputs.before, "--after", inputs.after];
        if (spec.requiredSlots.includes("used") && inputs.used) argv.push("--used", inputs.used);
        const r = runNode(kit.recordRepeatBin, argv, { cwd: kit.recordRepeatRoot || kit.usefulJobsRoot });
        if (r.error) {
          throw refuse("vendor-pin-engine-failed", r.error, { family });
        }
        if (!r.json) {
          throw refuse("vendor-pin-engine-failed", (r.stdout + r.stderr).slice(0, 800), {
            family,
            status: r.status,
          });
        }
        const reportPath = path.join(engineDir, "record-repeat.json");
        writeFileSync(reportPath, `${JSON.stringify(r.json, null, 2)}\n`);
        return {
          kind: "vendor-pin",
          jobId: "record-repeat",
          family,
          argv,
          exitCode: r.status,
          stdout: r.json,
          outDir: engineDir,
          outputs: [reportPath],
          refused: Boolean(r.json.refused),
          ok: r.json.ok !== false && !r.json.refused,
        };
      },
    },
  };
}

export async function runEngine(adapters, kind, req) {
  const key = kind === "vendor-pin" ? "vendorPin" : "catalog";
  const adapter = adapters[key];
  if (!adapter) {
    throw refuse("unknown-engine", "engine must be catalog or vendor-pin", { kind });
  }
  return adapter.run(req);
}
