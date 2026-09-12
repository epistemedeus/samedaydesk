#!/usr/bin/env node
/**
 * Cold CLI adapter for R04 Slack Web API.
 * Spawns useful-jobs 1.4.0 with exact flags. Never networks on the job path.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { witness } from "./witness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CONSUMER_DIR = HERE;
export const KIT_VERSION = "1.4.0";
export const KIT_SHA256 = "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f";
export const KIT_BYTES = 2575215;
export const DEFAULT_JOB = "api-upgrade-brief";

const FIX = (...parts) => join(HERE, "fixtures", ...parts);

export const FIXTURES = Object.freeze({
  openapiBefore: FIX("openapi", "before.excerpt.json"),
  openapiAfter: FIX("openapi", "after.excerpt.json"),
  used: FIX("openapi", "used.json"),
  usedControl: FIX("openapi", "used-control.json"),
  sdsBefore: FIX("sds", "before.json"),
  sdsAfter: FIX("sds", "after.json"),
  sdsControl: FIX("sds", "control-identical.json"),
  yarnLock: FIX("negative", "yarn.lock"),
  rawSwagger: FIX("negative", "raw-swagger.json"),
  liveUrl: "https://raw.githubusercontent.com/slackapi/slack-api-specs/master/web-api/slack_web_openapi_v2.json",
  openapiAsSchema: FIX("negative", "openapi-as-schema.json"),
  schemaUsed: FIX("negative", "schema-used.json"),
  opsBefore: FIX("operations", "before.json"),
  opsAfter: FIX("operations", "after.json"),
  opsDelta: FIX("operations", "delta.json"),
});

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 10; i += 1) {
    const archive = join(dir, "client/public/kit/useful-jobs-1.4.0.tar.gz");
    if (existsSync(archive)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function resolveKit({ extractIfMissing = true } = {}) {
  const vendorRoot = join(HERE, "vendor", "useful-jobs-1.4.0");
  const vendorCli = join(vendorRoot, "bin", "useful-jobs.mjs");
  if (existsSync(vendorCli)) {
    return { root: vendorRoot, cli: vendorCli, source: "vendor" };
  }
  if (!extractIfMissing) {
    const err = new Error("useful-jobs 1.4.0 vendor CLI missing");
    err.code = "kit-missing";
    throw err;
  }
  const repoRoot = findRepoRoot(HERE);
  if (!repoRoot) {
    const err = new Error("cannot locate published useful-jobs-1.4.0.tar.gz");
    err.code = "archive-missing";
    throw err;
  }
  const archive = join(repoRoot, "client/public/kit/useful-jobs-1.4.0.tar.gz");
  const st = statSync(archive);
  if (st.size !== KIT_BYTES) {
    const err = new Error(`kit archive bytes ${st.size} != ${KIT_BYTES}`);
    err.code = "archive-size-mismatch";
    throw err;
  }
  const digest = sha256File(archive);
  if (digest !== KIT_SHA256) {
    const err = new Error(`kit archive sha256 ${digest} != ${KIT_SHA256}`);
    err.code = "archive-digest-mismatch";
    throw err;
  }
  mkdirSync(join(HERE, "vendor"), { recursive: true });
  const tar = spawnSync("tar", ["-xzf", archive, "-C", join(HERE, "vendor")], { encoding: "utf8" });
  if (tar.status !== 0) {
    const err = new Error(`tar extract failed: ${tar.stderr || tar.status}`);
    err.code = "extract-failed";
    throw err;
  }
  if (!existsSync(vendorCli)) {
    const err = new Error("extract incomplete: missing bin/useful-jobs.mjs");
    err.code = "extract-incomplete";
    throw err;
  }
  return { root: vendorRoot, cli: vendorCli, source: "extracted" };
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(token);
  }
  return out;
}

function parseStdoutJson(stdout) {
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

function readJsonIfExists(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function readMaybeJson(path) {
  if (!path || typeof path !== "string" || /^https?:\/\//i.test(path)) return path;
  if (!existsSync(path)) return path;
  const text = readFileSync(path, "utf8");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Spawn useful-jobs 1.4.0. Local files only; no public fetch.
 */
export function runUsefulJob({
  jobId,
  args = [],
  outDir,
  timeoutMs = 90_000,
} = {}) {
  if (!jobId) {
    const err = new Error("missing jobId");
    err.code = "missing-job";
    throw err;
  }
  const kit = resolveKit();
  const argv = ["run", jobId, ...args];
  if (outDir) {
    const absOut = isAbsolute(outDir) ? outDir : resolve(HERE, outDir);
    mkdirSync(absOut, { recursive: true });
    if (!argv.includes("--out-dir")) argv.push("--out-dir", absOut);
  }
  const r = spawnSync(process.execPath, [kit.cli, ...argv], {
    cwd: kit.root,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" },
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  const stdoutJson = parseStdoutJson(r.stdout);
  const resolvedOut = outDir ? (isAbsolute(outDir) ? outDir : resolve(HERE, outDir)) : stdoutJson?.outDir || null;
  const outputs = {};
  if (resolvedOut && existsSync(resolvedOut)) {
    for (const name of [
      "upgrade-brief.json",
      "upgrade-brief.md",
      "route-diff.json",
      "route-diff.md",
      "drift.json",
      "drift.md",
    ]) {
      const p = join(resolvedOut, name);
      if (existsSync(p)) outputs[name] = p;
    }
  }
  return {
    ok: r.status === 0 && stdoutJson?.ok !== false,
    status: r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    stdoutJson,
    outDir: resolvedOut,
    outputs,
    timedOut: r.error?.code === "ETIMEDOUT",
    error: r.error ? String(r.error.message || r.error) : null,
    kit,
    jobId,
    argv,
  };
}

export function defaultInputs(mode = "positive") {
  if (mode === "control") {
    return {
      jobId: DEFAULT_JOB,
      before: FIXTURES.openapiBefore,
      after: FIXTURES.openapiAfter,
      used: FIXTURES.usedControl,
    };
  }
  if (mode === "control-identical") {
    return {
      jobId: DEFAULT_JOB,
      before: FIXTURES.openapiAfter,
      after: FIXTURES.openapiAfter,
      used: FIXTURES.usedControl,
    };
  }
  if (mode === "sds") {
    return {
      jobId: "route-table-diff",
      before: FIXTURES.sdsBefore,
      after: FIXTURES.sdsAfter,
    };
  }
  if (mode === "sds-control") {
    return {
      jobId: "route-table-diff",
      before: FIXTURES.sdsBefore,
      after: FIXTURES.sdsControl,
    };
  }
  return {
    jobId: DEFAULT_JOB,
    before: FIXTURES.openapiBefore,
    after: FIXTURES.openapiAfter,
    used: FIXTURES.used,
  };
}

export function runAdapter(options = {}) {
  const mode = options.mode || "positive";
  const defaults = defaultInputs(mode);
  const jobId = options.jobId || options.job || defaults.jobId;
  const before = options.before || defaults.before;
  const after = options.after || defaults.after;
  const used = options.used || defaults.used;
  const outDir = options.outDir;
  const extra = Array.isArray(options.extra) ? options.extra : [];
  const args = [];
  if (options.example === true) args.push("--example");
  else {
    if (before) args.push("--before", before);
    if (after) args.push("--after", after);
    if (used && jobId === "api-upgrade-brief") args.push("--used", used);
  }
  args.push(...extra);
  const engine = runUsefulJob({ jobId, args, outDir, timeoutMs: options.timeoutMs });
  const beforeDoc = typeof before === "string" && !/^https?:\/\//i.test(before) ? readMaybeJson(before) : before;
  const afterDoc = typeof after === "string" && !/^https?:\/\//i.test(after) ? readMaybeJson(after) : after;
  const usedDoc = used && typeof used === "string" && existsSync(used) ? readJsonIfExists(used) : used;
  let independent = null;
  try {
    independent = witness(beforeDoc, afterDoc, usedDoc);
  } catch (err) {
    independent = { fact: "unknown", error: String(err.message || err), changed: [], unchanged: [], added: [], removed: [], unknown: [] };
  }
  return {
    ...engine,
    witness: independent,
    inputs: { jobId, before, after, used: jobId === "api-upgrade-brief" ? used : null, outDir: engine.outDir },
    purchaseAuthority: false,
    networkOnJobPath: false,
  };
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function main(argv) {
  const args = parseArgs(argv);
  const mode = args.mode || (args.control ? "control" : "positive");
  const outDir = args["out-dir"] || join(HERE, "tmp-out", `${mode}-${Date.now().toString(36)}`);
  const result = runAdapter({
    mode,
    jobId: args.job || args._[0],
    before: args.before,
    after: args.after,
    used: args.used,
    outDir,
    extra: args["rewrite-homepage"] ? ["--rewrite-homepage"] : [],
    example: args.example === true,
  });
  writeJson(join(outDir, "adapter-result.json"), {
    ok: result.ok,
    jobId: result.jobId,
    status: result.status,
    stdoutJson: result.stdoutJson,
    witness: result.witness,
    outputs: result.outputs,
    purchaseAuthority: false,
    networkOnJobPath: false,
  });
  process.stdout.write(`${JSON.stringify({
    ok: result.ok,
    jobId: result.jobId,
    engine: result.stdoutJson,
    witnessFact: result.witness?.fact || null,
    outDir: result.outDir,
    purchaseAuthority: false,
  })}\n`);
  process.exit(result.ok ? 0 : result.status == null ? 1 : result.status);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
