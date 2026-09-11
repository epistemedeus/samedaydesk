import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { OrderRefuse } from "./errors.mjs";
import { USEFUL_JOBS_CLI } from "./pins.mjs";
import { ensureUsefulJobsKit } from "./kit.mjs";

function parseEngineJson(stdout) {
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

export function createUsefulJobsEngine({ kit = null, pins, timeoutMs = 120_000 } = {}) {
  return {
    kind: "useful-jobs-cli",
    async run({ engineId, inputs, outDir, example = false }) {
      const kitRoot = kit || ensureUsefulJobsKit(pins);
      const cli = join(kitRoot, pins.cli || USEFUL_JOBS_CLI);
      if (!existsSync(cli)) {
        throw new OrderRefuse("kit-cli-missing", `useful-jobs CLI missing at ${cli}`);
      }
      const args = [cli, "run", engineId];
      if (example) {
        throw new OrderRefuse("example-not-payable", "engine adapter refuses --example on this payable path", {
          falsifier: "F-SAMPLE",
        });
      }
      for (const inp of inputs) {
        args.push(inp.flag, inp.resolvedPath);
      }
      if (outDir) args.push("--out-dir", outDir);

      const result = spawnSync(process.execPath, args, {
        encoding: "utf8",
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        cwd: kitRoot,
      });

      const json = parseEngineJson(result.stdout);
      return {
        ok: result.status === 0 && json?.ok !== false,
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        json,
        error: json?.error || result.stderr || (result.status === 0 ? null : `useful-jobs exit ${result.status}`),
      };
    },
  };
}
