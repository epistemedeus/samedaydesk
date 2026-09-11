import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { classifySpawn } from "./classify.mjs";

export function spawnPageChange({
  cli,
  args,
  cwd,
  timeoutMs = 15_000,
} = {}) {
  if (!cli || !existsSync(cli)) {
    return classifySpawn({
      error: Object.assign(new Error(`page-change CLI missing: ${cli || ""}`), { code: "engine_unavailable" }),
      status: null,
      stdout: "",
      stderr: "",
      jsonExists: false,
    });
  }

  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    env: { ...process.env },
  });

  const outDirFlag = args.indexOf("--out-dir");
  const outDir = outDirFlag >= 0 ? args[outDirFlag + 1] : null;
  const jsonPath = outDir ? join(outDir, "page-change.json") : null;
  const mdPath = outDir ? join(outDir, "page-change.md") : null;
  const jsonExists = Boolean(jsonPath && existsSync(jsonPath));

  const classified = classifySpawn({
    error: result.error,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    jsonExists,
  });

  return {
    ...classified,
    stdout: result.stdout,
    stderr: result.stderr,
    jsonPath,
    mdPath,
    jsonExists,
    mdExists: Boolean(mdPath && existsSync(mdPath)),
  };
}
