#!/usr/bin/env node
/**
 * Cold CLI adapter: spawn useful-jobs 1.4.0 json-schema-webhook-drift.
 * Exact flags only. No network on the job path.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureKitAt } from "../../lib/ensure-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CONSUMER_ROOT = HERE;
export const JOB_ID = "json-schema-webhook-drift";
export const KIT_ROOT = join(HERE, "vendor", "useful-jobs-1.4.0");
export const KIT_CLI = join(KIT_ROOT, "bin", "useful-jobs.mjs");

export const DEFAULT_INPUTS = Object.freeze({
  before: join(HERE, "fixtures", "official", "schema.before.json"),
  after: join(HERE, "fixtures", "official", "schema.after.json"),
  used: join(HERE, "fixtures", "used", "used-positive.json"),
});

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function parseStdoutJson(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      /* keep scanning */
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readOutputFiles(outDir) {
  if (!outDir) return { json: null, md: null };
  const jsonPath = join(outDir, "drift-brief.json");
  const mdPath = join(outDir, "drift-brief.md");
  let json = null;
  let md = null;
  if (existsSync(jsonPath)) {
    try {
      json = JSON.parse(readFileSync(jsonPath, "utf8"));
    } catch {
      json = null;
    }
  }
  if (existsSync(mdPath)) md = readFileSync(mdPath, "utf8");
  return { json, md, jsonPath, mdPath };
}

export function runJob({
  before = DEFAULT_INPUTS.before,
  after = DEFAULT_INPUTS.after,
  used = DEFAULT_INPUTS.used,
  outDir,
  extra = [],
  timeoutMs = 60_000,
} = {}) {
  const kit = ensureKitAt(join(HERE, "vendor"));
  const cli = kit.cli;

  const args = [cli, "run", JOB_ID];
  if (before) args.push("--before", resolve(before));
  if (after) args.push("--after", resolve(after));
  if (used) args.push("--used", resolve(used));
  if (outDir) args.push("--out-dir", resolve(outDir));
  for (const item of extra) args.push(item);

  const r = spawnSync(process.execPath, args, {
    cwd: HERE,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" },
  });

  const stdout = r.stdout || "";
  const stderr = r.stderr || "";
  return {
    status: r.status == null ? 1 : r.status,
    stdout,
    stderr,
    stdoutJson: parseStdoutJson(stdout),
    outputs: readOutputFiles(outDir ? resolve(outDir) : null),
    timedOut: r.error?.code === "ETIMEDOUT",
    error: r.error ? String(r.error.message || r.error) : null,
  };
}

function main(argv) {
  const args = parseArgs(argv);
  const result = runJob({
    before: args.before || DEFAULT_INPUTS.before,
    after: args.after || DEFAULT_INPUTS.after,
    used: args.used || DEFAULT_INPUTS.used,
    outDir: args["out-dir"],
    extra: args._,
  });
  if (result.stdout) process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status == null ? 1 : result.status);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2));
}
