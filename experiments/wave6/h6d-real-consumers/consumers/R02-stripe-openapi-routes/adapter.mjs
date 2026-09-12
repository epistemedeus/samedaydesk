/**
 * Cold CLI adapter for useful-jobs 1.4.0 api-upgrade-brief.
 * Spawns the published kit only. Never networks on the job path.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CONSUMER_DIR = HERE;
export const JOB_ID = "api-upgrade-brief";
export const KIT_VERSION = "1.4.0";
export const KIT_SHA256 = "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f";
export const KIT_BYTES = 2575215;

const REPO_ROOT = resolve(HERE, "../../../../..");
const ARCHIVE = join(REPO_ROOT, "client/public/kit/useful-jobs-1.4.0.tar.gz");

export const FIXTURES = Object.freeze({
  before: join(HERE, "fixtures/openapi/before.yaml"),
  after: join(HERE, "fixtures/openapi/after.yaml"),
  used: join(HERE, "fixtures/used.json"),
  usedUnusedPointer: join(HERE, "fixtures/used-control-unused-pointer.json"),
  yarnLock: join(HERE, "fixtures/negative/yarn.lock"),
  schemaUsed: join(HERE, "fixtures/negative/schema-used.json"),
  notOpenApi: join(HERE, "fixtures/negative/not-openapi.json"),
});

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function ensureKit() {
  const vendor = join(HERE, "vendor");
  const root = join(vendor, "useful-jobs-1.4.0");
  const cli = join(root, "bin/useful-jobs.mjs");
  if (existsSync(cli)) return { root, cli };
  if (!existsSync(ARCHIVE)) {
    const err = new Error(`missing useful-jobs archive ${ARCHIVE}`);
    err.code = "missing-archive";
    throw err;
  }
  const st = statSync(ARCHIVE);
  if (st.size !== KIT_BYTES) {
    const err = new Error(`archive bytes ${st.size} != ${KIT_BYTES}`);
    err.code = "archive-size-mismatch";
    throw err;
  }
  const digest = sha256File(ARCHIVE);
  if (digest !== KIT_SHA256) {
    const err = new Error(`archive sha256 mismatch`);
    err.code = "archive-digest-mismatch";
    throw err;
  }
  mkdirSync(vendor, { recursive: true });
  const tar = spawnSync("tar", ["-xzf", ARCHIVE, "-C", vendor], { encoding: "utf8" });
  if (tar.status !== 0) {
    const err = new Error(`tar extract failed: ${tar.stderr || tar.status}`);
    err.code = "extract-failed";
    throw err;
  }
  if (!existsSync(cli)) {
    const err = new Error("extract missing bin/useful-jobs.mjs");
    err.code = "extract-incomplete";
    throw err;
  }
  return { root, cli };
}

function parseStdoutJson(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function runUsefulJob({
  jobId,
  args = [],
  outDir = null,
  cwd = HERE,
  timeoutMs = 120_000,
} = {}) {
  const { root, cli } = ensureKit();
  const argv = ["run", jobId, ...args];
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    if (!argv.includes("--out-dir")) argv.push("--out-dir", outDir);
  }
  const env = { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" };
  const r = spawnSync(process.execPath, [cli, ...argv], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  const stdoutJson = parseStdoutJson(r.stdout);
  const outputs = {};
  const targetDir = outDir || stdoutJson?.outDir || null;
  if (targetDir) {
    for (const name of ["upgrade-brief.json", "upgrade-brief.md", "drift-brief.json", "route-diff.json"]) {
      const p = join(targetDir, name);
      if (existsSync(p)) outputs[name] = p;
    }
  }
  return {
    jobId,
    status: r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    stdoutJson,
    outputs,
    outDir: targetDir,
    timedOut: r.error?.code === "ETIMEDOUT",
    error: r.error ? String(r.error.message || r.error) : null,
    kitRoot: root,
    argv,
    network: false,
    purchaseAuthority: false,
  };
}

export function runPositive(outDir) {
  return runUsefulJob({
    jobId: JOB_ID,
    args: ["--before", FIXTURES.before, "--after", FIXTURES.after, "--used", FIXTURES.used],
    outDir,
  });
}

export function runControlIdentical(outDir) {
  return runUsefulJob({
    jobId: JOB_ID,
    args: ["--before", FIXTURES.before, "--after", FIXTURES.before, "--used", FIXTURES.used],
    outDir,
  });
}

export function runControlUnusedPointer(outDir) {
  return runUsefulJob({
    jobId: JOB_ID,
    args: [
      "--before",
      FIXTURES.before,
      "--after",
      FIXTURES.after,
      "--used",
      FIXTURES.usedUnusedPointer,
    ],
    outDir,
  });
}

export function runNegativeMissing(outDir) {
  return runUsefulJob({
    jobId: JOB_ID,
    args: ["--before", FIXTURES.before, "--after", FIXTURES.after],
    outDir,
  });
}

export function runNegativeYarnLock(outDir) {
  return runUsefulJob({
    jobId: JOB_ID,
    args: ["--before", FIXTURES.yarnLock, "--after", FIXTURES.after, "--used", FIXTURES.used],
    outDir,
  });
}

export function runNegativeOpenApiAsSchema(outDir) {
  return runUsefulJob({
    jobId: "json-schema-webhook-drift",
    args: ["--before", FIXTURES.before, "--after", FIXTURES.after, "--used", FIXTURES.schemaUsed],
    outDir,
  });
}

export function runNegativeOpenApiAsRouteTable(outDir) {
  return runUsefulJob({
    jobId: "route-table-diff",
    args: ["--before", FIXTURES.before, "--after", FIXTURES.after],
    outDir,
  });
}

export function runNegativeLiveUrl(outDir) {
  return runUsefulJob({
    jobId: JOB_ID,
    args: [
      "--before",
      "https://api.stripe.com/v1/customers",
      "--after",
      FIXTURES.after,
      "--used",
      FIXTURES.used,
    ],
    outDir,
  });
}

function parseMode(argv) {
  const idx = argv.indexOf("--mode");
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  return "positive";
}

function parseOutDir(argv) {
  const idx = argv.indexOf("--out-dir");
  if (idx >= 0 && argv[idx + 1]) return resolve(argv[idx + 1]);
  return join(HERE, "out", "adapter-run");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const mode = parseMode(argv);
  const outDir = parseOutDir(argv);
  const runners = {
    positive: runPositive,
    control: runControlIdentical,
    "control-unused": runControlUnusedPointer,
    "negative-missing": runNegativeMissing,
    "negative-yarn": runNegativeYarnLock,
    "negative-openapi-as-schema": runNegativeOpenApiAsSchema,
    "negative-openapi-as-routes": runNegativeOpenApiAsRouteTable,
    "negative-live-url": runNegativeLiveUrl,
  };
  const run = runners[mode];
  if (!run) {
    process.stdout.write(JSON.stringify({ ok: false, error: `unknown-mode ${mode}` }) + "\n");
    process.exit(2);
  }
  const result = run(outDir);
  process.stdout.write(
    JSON.stringify({
      ok: result.status === 0 && result.stdoutJson?.ok !== false,
      mode,
      jobId: result.jobId,
      status: result.status,
      stdoutJson: result.stdoutJson,
      outDir: result.outDir,
      outputs: result.outputs,
      purchaseAuthority: false,
      liveStripe: false,
    }) + "\n",
  );
  process.exit(result.status == null ? 1 : result.status);
}
