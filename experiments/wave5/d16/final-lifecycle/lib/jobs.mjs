import { existsSync } from "node:fs";
import { join } from "node:path";
import { COMPAT_ORIGINAL_SIX, PINNED_IMPLEMENTATION } from "./contract.mjs";
import { parseStdoutJson } from "./json.mjs";
import { callerBudget } from "./kit.mjs";
import { spawnNodeSync } from "./process.mjs";

export const JOBS = Object.freeze([
  {
    id: "lockfile-pin-delta",
    outputs: ["pin-delta.json", "pin-delta.md"],
    argv(kit, outDir) {
      return [
        "run",
        "lockfile-pin-delta",
        "--before",
        join(kit, "samples/lockfile/h04-pub-lock-01/before.json"),
        "--after",
        join(kit, "samples/lockfile/h04-pub-lock-01/after.json"),
        "--out-dir",
        outDir,
      ];
    },
  },
  {
    id: "json-schema-webhook-drift",
    outputs: ["drift-brief.json", "drift-brief.md"],
    argv(kit, outDir) {
      return [
        "run",
        "json-schema-webhook-drift",
        "--before",
        join(kit, "samples/schema/h04-schema-01/before.json"),
        "--after",
        join(kit, "samples/schema/h04-schema-01/after.json"),
        "--used",
        join(kit, "samples/schema/h04-schema-01/used.json"),
        "--out-dir",
        outDir,
      ];
    },
  },
  {
    id: "route-table-diff",
    outputs: ["route-diff.json", "route-diff.md"],
    argv(kit, outDir) {
      return [
        "run",
        "route-table-diff",
        "--before",
        join(kit, "samples/routes/h04-route-01/before.json"),
        "--after",
        join(kit, "samples/routes/h04-route-01/after.json"),
        "--out-dir",
        outDir,
      ];
    },
  },
  {
    id: "page-change-offline-job",
    outputs: ["page-change.json", "page-change.md"],
    argv(kit, outDir) {
      return [
        "run",
        "page-change-offline-job",
        "--job",
        join(kit, "samples/page/h04-page-01/job.json"),
        "--out-dir",
        outDir,
      ];
    },
  },
  {
    id: COMPAT_ORIGINAL_SIX,
    outputs: ["budget-impact.json", "budget-impact.md"],
    argv(_kit, outDir) {
      const files = callerBudget();
      return [
        "run",
        "vendor-budget-impact",
        "--before",
        files.before,
        "--after",
        files.after,
        "--out-dir",
        outDir,
      ];
    },
  },
]);

export function jobById(id) {
  const job = JOBS.find((row) => row.id === id);
  if (!job) throw new Error(`unknown job ${id}`);
  return job;
}

export function runUsefulJobs(kit, argv, { timeoutMs, env } = {}) {
  const cli = join(kit, PINNED_IMPLEMENTATION.publicCli);
  const result = spawnNodeSync([cli, ...argv], { cwd: kit, env, timeoutMs });
  const parsed = parseStdoutJson(result.stdout);
  return {
    status: result.status,
    signal: result.signal,
    error: result.error,
    stdout: result.stdout,
    stderr: result.stderr,
    json: parsed.json,
    wholeJson: parsed.whole,
    cli,
  };
}

export function outputsPresent(dir, names) {
  return names.filter((name) => existsSync(join(dir, name)));
}

export function outputRoot(requested, json) {
  return json?.outDir || requested;
}
