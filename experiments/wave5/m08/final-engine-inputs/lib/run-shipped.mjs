import { spawnSync } from "node:child_process";
import { resolveKit } from "./resolve-kit.mjs";

/**
 * Spawn the shipped public-kit CLI, not the first-wave M08 consumer and not in-tree tools/.
 */
export function runShipped({ before, after, outDir, extraArgs = [], kit } = {}) {
  const resolved = kit || resolveKit();
  const args = [resolved.bin, "run", "route-table-diff", ...extraArgs];
  if (before) args.push("--before", before);
  if (after) args.push("--after", after);
  if (outDir) args.push("--out-dir", outDir);
  return spawnSync(process.execPath, args, {
    cwd: resolved.root,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

export function parseStdout(result) {
  const text = String(result.stdout || "").trim();
  if (!text) {
    throw new Error(`shipped CLI produced no stdout. status=${result.status} stderr=${result.stderr}`);
  }
  const line = text.split("\n").filter(Boolean).pop();
  return JSON.parse(line);
}
