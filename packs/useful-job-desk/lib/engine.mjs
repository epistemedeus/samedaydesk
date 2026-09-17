import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, join, relative, resolve } from "node:path";
import { outputFingerprint } from "./hash.mjs";
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

export function outputStaysInOutDir(outDir, name) {
  if (!outDir || typeof name !== "string" || !name.trim() || name.includes("\0")) return false;
  const root = resolve(outDir);
  const target = resolve(root, name);
  const rel = relative(root, target);
  if (!rel || isAbsolute(rel)) return false;
  if (rel.split(/[\\/]/).some((part) => part === "..")) return false;
  return true;
}

export function isPresentFile(outDir, name) {
  if (!outputStaysInOutDir(outDir, name)) return false;
  const p = resolve(outDir, name);
  try {
    return existsSync(p) && statSync(p).isFile();
  } catch {
    return false;
  }
}

export function outputsPresent(outDir, names) {
  if (!outDir || !names?.length) return [];
  return names.filter((name) => isPresentFile(outDir, name));
}

function argsIncludeExample(args) {
  return args.some((a) => a === "--example" || a.startsWith("--example="));
}

export function runPublishedJob(bound, { job, args = [], outDir } = {}) {
  if (argsIncludeExample(args)) {
    return {
      job,
      argv: ["node", PIN.engine.cli, "run", job, ...args],
      status: 2,
      stdout: "",
      stderr: "",
      engineJson: null,
      digest: null,
      outputFingerprint: null,
      engineStatus: null,
      outDir: outDir || null,
      promisedOutputs: promisedOutputs(bound.kitRoot, job),
      presentOutputs: [],
      missingOutputs: promisedOutputs(bound.kitRoot, job),
      delivered: false,
      code: "example-not-caller-file",
      cliInvoked: false,
      engineVersion: bound.version,
      engineSha256: bound.sha256,
    };
  }

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
  const engineJson =
    parsed.find((j) => j && typeof j === "object" && (j.appId || j.ok !== undefined)) || null;
  const promised = promisedOutputs(bound.kitRoot, job);
  const present = outputsPresent(outDir, promised);
  const engineOk = r.status === 0 && engineJson?.ok !== false;
  const missing = promised.filter((name) => !present.includes(name));
  const delivered = Boolean(engineOk && promised.length > 0 && missing.length === 0);
  const fingerprint = delivered ? outputFingerprint(outDir, promised) : null;

  return {
    job,
    argv: ["node", PIN.engine.cli, ...argv],
    status: r.status == null ? 1 : r.status,
    stdout,
    stderr,
    engineJson,
    digest: engineJson?.digest || null,
    outputFingerprint: fingerprint,
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
