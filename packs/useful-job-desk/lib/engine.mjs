import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PIN } from "./paths.mjs";

function parseJsonBlobs(text) {
  const blobs = [];
  const trimmed = String(text || "").trim();
  if (!trimmed) return blobs;
  try {
    blobs.push(JSON.parse(trimmed));
    return blobs;
  } catch {
    // fall through to line-wise parse
  }
  for (const line of trimmed.split("\n")) {
    const s = line.trim();
    if (!s.startsWith("{") && !s.startsWith("[")) continue;
    try {
      blobs.push(JSON.parse(s));
    } catch {
      // ignore non-json lines
    }
  }
  return blobs;
}

export function promisedOutputs(kitRoot, jobId) {
  try {
    const catalog = JSON.parse(readFileSync(join(kitRoot, "catalog.json"), "utf8"));
    const job = (catalog.jobs || []).find((j) => j.id === jobId);
    return job?.outputs ? [...job.outputs] : [];
  } catch {
    return [];
  }
}

export function outputsPresent(outDir, names) {
  if (!outDir || !names?.length) return [];
  return names.filter((name) => existsSync(join(outDir, name)));
}

export function runPublishedJob(bound, { job, args = [], outDir } = {}) {
  const cli = bound.cli;
  const argv = ["run", job, ...args];
  if (outDir && !args.includes("--out-dir")) {
    argv.push("--out-dir", outDir);
  }
  const r = spawnSync(process.execPath, [cli, ...argv], {
    encoding: "utf8",
    cwd: bound.kitRoot,
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...process.env,
      USEFUL_JOBS_ORIGIN: "",
    },
  });
  const stdout = r.stdout || "";
  const stderr = r.stderr || "";
  const parsed = [...parseJsonBlobs(stdout), ...parseJsonBlobs(stderr)];
  const engineJson = parsed.find((j) => j && typeof j === "object" && (j.appId || j.ok !== undefined)) || null;
  const promised = promisedOutputs(bound.kitRoot, job);
  const present = outputsPresent(outDir, promised);
  const engineOk = r.status === 0 && engineJson?.ok !== false;
  const missing = promised.filter((name) => !present.includes(name));
  const delivered = Boolean(engineOk && promised.length > 0 && missing.length === 0);

  return {
    job,
    argv: ["node", PIN.engine.cli, ...argv],
    status: r.status == null ? 1 : r.status,
    stdout,
    stderr,
    engineJson,
    digest: engineJson?.digest || null,
    engineStatus: engineJson?.status || null,
    outDir: outDir || engineJson?.outDir || null,
    promisedOutputs: promised,
    presentOutputs: present,
    missingOutputs: missing,
    delivered,
    cliInvoked: true,
    engineVersion: bound.version,
    engineSha256: bound.sha256,
  };
}
