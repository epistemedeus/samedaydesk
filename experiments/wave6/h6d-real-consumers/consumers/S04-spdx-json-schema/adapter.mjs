#!/usr/bin/env node
/**
 * Cold CLI adapter for json-schema-webhook-drift on official SPDX JSON Schemas.
 * Spawns useful-jobs 1.4.0. No network on the job path. Not OpenAPI.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureKitAt } from "../../lib/ensure-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT_CLI = join(HERE, "vendor/useful-jobs-1.4.0/bin/useful-jobs.mjs");
const JOB = "json-schema-webhook-drift";

export const CONSUMER_ID = "S04-spdx-json-schema";
export const JOB_ID = JOB;

export const FIXTURES = Object.freeze({
  before: join(HERE, "fixtures/official/spdx-schema-2-3.json"),
  after: join(HERE, "fixtures/official/spdx-schema-3-0-1.json"),
  usedPositive: join(HERE, "fixtures/used/positive.json"),
  usedControlIdentical: join(HERE, "fixtures/used/control-identical.json"),
  usedControlType: join(HERE, "fixtures/used/control-unchanged-pointer.json"),
  usedNegative: join(HERE, "fixtures/used/negative.json"),
  openapiYaml: join(HERE, "fixtures/negative/openapi.yaml"),
  openapiJson: join(HERE, "fixtures/negative/openapi.json"),
});

const MODES = Object.freeze({
  positive: {
    before: FIXTURES.before,
    after: FIXTURES.after,
    used: FIXTURES.usedPositive,
  },
  control: {
    before: FIXTURES.before,
    after: FIXTURES.before,
    used: FIXTURES.usedControlIdentical,
  },
  "control-type": {
    before: FIXTURES.before,
    after: FIXTURES.after,
    used: FIXTURES.usedControlType,
  },
  "negative-yaml": {
    before: FIXTURES.openapiYaml,
    after: FIXTURES.openapiYaml,
    used: FIXTURES.usedNegative,
  },
  "negative-openapi": {
    before: FIXTURES.openapiJson,
    after: FIXTURES.openapiJson,
    used: FIXTURES.usedNegative,
  },
  "missing-used": {
    before: FIXTURES.before,
    after: FIXTURES.after,
    used: null,
  },
});

function parseStdoutJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        return JSON.parse(lines[i]);
      } catch {
        // continue
      }
    }
    return null;
  }
}

function readJsonIfPresent(path) {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function runJob({
  before,
  after,
  used,
  outDir,
  extra = [],
  timeoutMs = 60_000,
} = {}) {
  const kit = ensureKitAt(join(HERE, "vendor"));
  const args = [kit.cli, "run", JOB];
  if (before) args.push("--before", resolve(before));
  if (after) args.push("--after", resolve(after));
  if (used) args.push("--used", resolve(used));
  if (outDir) {
    const resolved = resolve(outDir);
    mkdirSync(resolved, { recursive: true });
    args.push("--out-dir", resolved);
  }
  args.push(...extra);

  const r = spawnSync(process.execPath, args, {
    cwd: HERE,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" },
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });

  const stdoutJson = parseStdoutJson(r.stdout);
  const resolvedOut = outDir ? resolve(outDir) : stdoutJson?.outDir || null;
  const briefJsonPath = resolvedOut ? join(resolvedOut, "drift-brief.json") : null;
  const briefMdPath = resolvedOut ? join(resolvedOut, "drift-brief.md") : null;
  return {
    ok: r.status === 0 && stdoutJson?.ok === true,
    status: r.status,
    timedOut: r.error?.code === "ETIMEDOUT",
    error: r.error ? String(r.error.message || r.error) : null,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    stdoutJson,
    brief: readJsonIfPresent(briefJsonPath),
    briefMd: briefMdPath && existsSync(briefMdPath) ? readFileSync(briefMdPath, "utf8") : null,
    outputs: {
      outDir: resolvedOut,
      json: briefJsonPath && existsSync(briefJsonPath) ? briefJsonPath : null,
      md: briefMdPath && existsSync(briefMdPath) ? briefMdPath : null,
    },
    purchaseAuthority: false,
    jobId: JOB,
    consumerId: CONSUMER_ID,
    sample: Boolean(stdoutJson?.sample),
    exampleMode: Boolean(stdoutJson?.exampleMode),
  };
}

export function runMode(mode, { outDir, extra = [] } = {}) {
  const spec = MODES[mode];
  if (!spec) {
    const err = new Error(`unknown mode ${mode}`);
    err.code = "unknown-mode";
    throw err;
  }
  return runJob({ ...spec, outDir, extra });
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args.h) {
    process.stdout.write(
      `S04 SPDX JSON Schema adapter (useful-jobs 1.4.0 ${JOB})

Usage:
  node adapter.mjs [--mode positive|control|control-type|negative-yaml|negative-openapi|missing-used]
  node adapter.mjs --before <json> --after <json> --used <json> --out-dir <dir>

No network. purchaseAuthority=false. Not OpenAPI. Not --example.
`,
    );
    return 0;
  }
  const mode = args.mode || (args.before || args.after || args.used ? null : "positive");
  const result = mode
    ? runMode(String(mode), { outDir: args["out-dir"] || null })
    : runJob({
        before: args.before,
        after: args.after,
        used: args.used,
        outDir: args["out-dir"],
      });
  if (result.stdout) process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status == null ? 1 : result.status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(main());
}
