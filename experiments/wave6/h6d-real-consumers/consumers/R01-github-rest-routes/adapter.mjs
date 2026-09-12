#!/usr/bin/env node
/**
 * Cold CLI adapter: spawn useful-jobs 1.4.0 api-upgrade-brief (and optional
 * route-table-diff). Never networks on the job path.
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
const KIT_VERSION = "1.4.0";
const KIT_ROOT_NAME = "useful-jobs-1.4.0";
const KIT_SHA256 = "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f";
const KIT_BYTES = 2575215;
const JOB_ID = "api-upgrade-brief";
const ROUTE_JOB_ID = "route-table-diff";
const BRIEF_OUTPUTS = Object.freeze(["upgrade-brief.json", "upgrade-brief.md"]);
const ROUTE_OUTPUTS = Object.freeze(["route-diff.json", "route-diff.md"]);

export const DEFAULT_BEFORE = join(HERE, "fixtures/openapi/before.yaml");
export const DEFAULT_AFTER = join(HERE, "fixtures/openapi/after.yaml");
export const DEFAULT_USED = join(HERE, "fixtures/openapi/used.json");
export const DEFAULT_USED_CONTROL = join(HERE, "fixtures/openapi/used-control-git.json");
export const DEFAULT_ROUTE_BEFORE = join(HERE, "fixtures/projection/before.route-table.json");
export const DEFAULT_ROUTE_AFTER = join(HERE, "fixtures/projection/after.route-table.json");

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function repoRoot() {
  return resolve(HERE, "../../../../..");
}

function publishedArchive() {
  return join(repoRoot(), "client/public/kit/useful-jobs-1.4.0.tar.gz");
}

export function ensureKit() {
  const vendorRoot = join(HERE, "vendor", KIT_ROOT_NAME);
  const cli = join(vendorRoot, "bin/useful-jobs.mjs");
  if (existsSync(cli)) {
    return { root: vendorRoot, cli, extracted: false, version: KIT_VERSION };
  }
  const archive = publishedArchive();
  if (!existsSync(archive)) {
    const err = new Error(`missing published kit archive ${archive}`);
    err.code = "missing-archive";
    throw err;
  }
  const st = statSync(archive);
  if (st.size !== KIT_BYTES) {
    const err = new Error(`kit archive size ${st.size} != ${KIT_BYTES}`);
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
  if (!existsSync(cli)) {
    const err = new Error(`extracted kit missing ${cli}`);
    err.code = "extract-incomplete";
    throw err;
  }
  return { root: vendorRoot, cli, extracted: true, version: KIT_VERSION, digest };
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

function parseStdoutJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const lines = trimmed.split(/\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        return JSON.parse(lines[i]);
      } catch {
        /* continue */
      }
    }
    return null;
  }
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function spawnJob({ kit, jobId, flags, outDir, timeoutMs }) {
  mkdirSync(outDir, { recursive: true });
  const args = [kit.cli, "run", jobId, ...flags, "--out-dir", outDir];
  const spawned = spawnSync(process.execPath, args, {
    cwd: kit.root,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" },
    encoding: "utf8",
    timeout: timeoutMs || 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    spawned,
    stdoutJson: parseStdoutJson(spawned.stdout),
  };
}

/**
 * Spawn useful-jobs 1.4.0 api-upgrade-brief with exact flags.
 * Pass used: false to omit --used (negative / missing-required-inputs).
 */
export function runApiUpgradeBrief(options = {}) {
  const kit = ensureKit();
  const before = resolve(String(options.before || DEFAULT_BEFORE));
  const after = resolve(String(options.after || DEFAULT_AFTER));
  const omitUsed = options.used === false || options.used === null;
  const used = omitUsed ? null : resolve(String(options.used || DEFAULT_USED));
  const outDir = resolve(String(options.outDir || join(HERE, "out", "api-upgrade-brief")));
  const flags = ["--before", before, "--after", after];
  if (used) flags.push("--used", used);
  const { spawned, stdoutJson } = spawnJob({
    kit,
    jobId: JOB_ID,
    flags,
    outDir,
    timeoutMs: options.timeoutMs,
  });
  const reportPath = join(outDir, "upgrade-brief.json");
  const mdPath = join(outDir, "upgrade-brief.md");
  const report = readJsonIfExists(reportPath);
  const markdown = existsSync(mdPath) ? readFileSync(mdPath, "utf8") : null;
  return {
    ok: spawned.status === 0 && stdoutJson?.ok === true,
    status: spawned.status == null ? 1 : spawned.status,
    stdout: spawned.stdout || "",
    stderr: spawned.stderr || "",
    stdoutJson,
    report,
    markdown,
    outDir,
    outputs: {
      json: existsSync(reportPath) ? reportPath : null,
      md: existsSync(mdPath) ? mdPath : null,
      names: BRIEF_OUTPUTS,
    },
    timedOut: spawned.error?.code === "ETIMEDOUT",
    kit: { root: kit.root, cli: kit.cli, version: KIT_VERSION },
    inputs: { before, after, used },
    jobId: JOB_ID,
    purchaseAuthority: false,
    network: false,
    runtimeCompatibilityProof: false,
  };
}

/**
 * Spawn useful-jobs 1.4.0 route-table-diff. OpenAPI path maps are refused.
 * Projection catalogs are labeled non-equivalent (HTTP method dropped).
 */
export function runRouteTableDiff(options = {}) {
  const kit = ensureKit();
  const before = resolve(String(options.before || DEFAULT_ROUTE_BEFORE));
  const after = resolve(String(options.after || DEFAULT_ROUTE_AFTER));
  const outDir = resolve(String(options.outDir || join(HERE, "out", "route-table-diff")));
  const flags = ["--before", before, "--after", after];
  const { spawned, stdoutJson } = spawnJob({
    kit,
    jobId: ROUTE_JOB_ID,
    flags,
    outDir,
    timeoutMs: options.timeoutMs,
  });
  const reportPath = join(outDir, "route-diff.json");
  const mdPath = join(outDir, "route-diff.md");
  const report = readJsonIfExists(reportPath);
  const markdown = existsSync(mdPath) ? readFileSync(mdPath, "utf8") : null;
  return {
    ok: spawned.status === 0 && stdoutJson?.ok === true,
    status: spawned.status == null ? 1 : spawned.status,
    stdout: spawned.stdout || "",
    stderr: spawned.stderr || "",
    stdoutJson,
    report,
    markdown,
    outDir,
    outputs: {
      json: existsSync(reportPath) ? reportPath : null,
      md: existsSync(mdPath) ? mdPath : null,
      names: ROUTE_OUTPUTS,
    },
    timedOut: spawned.error?.code === "ETIMEDOUT",
    kit: { root: kit.root, cli: kit.cli, version: KIT_VERSION },
    inputs: { before, after },
    jobId: ROUTE_JOB_ID,
    purchaseAuthority: false,
    network: false,
    equivalentToOpenApi: false,
  };
}

export function run(options = {}) {
  if (options.job === ROUTE_JOB_ID || options.jobId === ROUTE_JOB_ID) {
    return runRouteTableDiff(options);
  }
  return runApiUpgradeBrief(options);
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help || args.h) {
    process.stdout.write(
      "adapter: cold useful-jobs 1.4.0 api-upgrade-brief\n" +
        "  node adapter.mjs [--before openapi] [--after openapi] [--used used.json] [--out-dir dir]\n" +
        "  node adapter.mjs --job route-table-diff [--before table] [--after table] [--out-dir dir]\n",
    );
    process.exit(0);
  }
  const job = args.job === ROUTE_JOB_ID ? ROUTE_JOB_ID : JOB_ID;
  const result =
    job === ROUTE_JOB_ID
      ? runRouteTableDiff({
          before: args.before,
          after: args.after,
          outDir: args["out-dir"],
        })
      : runApiUpgradeBrief({
          before: args.before,
          after: args.after,
          used: args["omit-used"] ? false : args.used,
          outDir: args["out-dir"],
        });
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: result.ok,
        jobId: result.jobId,
        status: result.stdoutJson?.status ?? null,
        exit: result.status,
        stdoutJson: result.stdoutJson,
        outDir: result.outDir,
        outputs: result.outputs,
        purchaseAuthority: false,
        network: false,
        runtimeCompatibilityProof: false,
        code: result.stdoutJson?.code || null,
        error: result.stdoutJson?.error || null,
      },
      null,
      2,
    )}\n`,
  );
  process.exit(result.status == null ? 1 : result.status);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
