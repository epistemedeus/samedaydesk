#!/usr/bin/env node
/**
 * Cold CLI adapter for page-change-offline-job on held SDS useful-jobs batches.
 * Spawns useful-jobs 1.4.0. No live fetch, payment, or scheduler.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import fs from "node:fs";
import { ensureKitAt } from "../../lib/ensure-kit.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const CONSUMER_ROOT = here;
export const KIT_ROOT = join(here, "vendor", "useful-jobs-1.4.0");
export const KIT_BIN = join(KIT_ROOT, "bin", "useful-jobs.mjs");
export const KIT_ARCHIVE_SHA256 = "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f";
export const KIT_ARCHIVE_BYTES = 2575215;
export const JOB_ID = "page-change-offline-job";
export const DEFAULT_JOB = join(here, "fixtures", "held", "job.json");
export const DEFAULT_FIELDS = "title,description,headings";
export const HELD_CLOCK = "2026-09-12T12:00:00.000Z";

function die(message, extra = {}) {
  const body = { ok: false, error: message, purchaseAuthority: false, ...extra };
  process.stderr.write(`${JSON.stringify(body)}\n`);
  process.exit(2);
}

export function parseJsonBlob(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
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

function readWritten(outDir) {
  if (!outDir) return { json: null, markdown: null, paths: null };
  const jsonPath = join(outDir, "page-change.json");
  const mdPath = join(outDir, "page-change.md");
  const json = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, "utf8")) : null;
  const markdown = existsSync(mdPath) ? readFileSync(mdPath, "utf8") : null;
  return {
    json,
    markdown,
    paths: {
      jsonPath: existsSync(jsonPath) ? jsonPath : null,
      mdPath: existsSync(mdPath) ? mdPath : null,
    },
  };
}

/**
 * Spawn useful-jobs 1.4.0 page-change-offline-job with exact flags.
 * @param {{job?: string, outDir?: string, extra?: string[], clock?: string, fields?: string, before?: string, after?: string, compare?: boolean}} opts
 */
export function runPageChange(opts = {}) {
  const kit = ensureKitAt(join(here, "vendor"));
  const extra = Array.isArray(opts.extra) ? [...opts.extra] : [];
  const outDir = resolve(opts.outDir ?? fs.mkdtempSync(join(os.tmpdir(), "p04-page-change-")));
  mkdirSync(outDir, { recursive: true });

  const args = [kit.cli, "run", JOB_ID];
  if (opts.compare || opts.before || opts.after) {
    args.push("compare");
    if (!opts.before || !opts.after) {
      return { ok: false, status: 2, error: "compare-requires-before-after" };
    }
    args.push("--before", resolve(opts.before), "--after", resolve(opts.after));
    args.push("--fields", opts.fields ?? DEFAULT_FIELDS);
    if (opts.clock) args.push("--clock", opts.clock);
  } else {
    const job = resolve(opts.job ?? DEFAULT_JOB);
    args.push("--job", job);
    if (opts.clock) args.push("--clock", opts.clock);
    if (opts.fields) args.push("--fields", opts.fields);
  }
  args.push("--out-dir", outDir);
  args.push(...extra);

  const env = {
    ...process.env,
    NODE_OPTIONS: "--max-old-space-size=768",
  };
  delete env.HTTP_PROXY;
  delete env.HTTPS_PROXY;
  delete env.ALL_PROXY;
  delete env.http_proxy;
  delete env.https_proxy;

  const spawned = spawnSync(process.execPath, args, {
    cwd: KIT_ROOT,
    encoding: "utf8",
    env,
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdout = spawned.stdout || "";
  const stderr = spawned.stderr || "";
  const body = parseJsonBlob(stdout) || parseJsonBlob(stderr);
  const written = readWritten(outDir);
  const report = written.json?.report ?? body?.report ?? null;
  const status = spawned.status == null ? 1 : spawned.status;
  return {
    ok: status === 0 && body?.ok === true,
    status,
    args: args.slice(1),
    stdout,
    stderr,
    body,
    report,
    written,
    outDir,
    error: spawned.error ? spawned.error.message : body?.message ?? null,
    code: body?.code ?? spawned.error?.code ?? null,
    purchaseAuthority: false,
    networkUsed: false,
    timedOut: spawned.signal === "SIGTERM" && spawned.status == null,
  };
}

function parseCli(argv) {
  const out = { extra: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--job") out.job = argv[++i];
    else if (token === "--out-dir") out.outDir = argv[++i];
    else if (token === "--clock") out.clock = argv[++i];
    else if (token === "--fields") out.fields = argv[++i];
    else if (token === "--before") out.before = argv[++i];
    else if (token === "--after") out.after = argv[++i];
    else if (token === "compare") out.compare = true;
    else if (token === "--help" || token === "-h") out.help = true;
    else out.extra.push(token);
  }
  return out;
}

const usage = `P04 adapter — useful-jobs 1.4.0 page-change-offline-job

Usage:
  node adapter.mjs [--job PATH] [--out-dir DIR]
  node adapter.mjs compare --before PATH --after PATH --clock ISO8601Z --out-dir DIR

Clock required. --example refused by the engine. No live fetch.
`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = parseCli(process.argv.slice(2));
  if (cli.help) {
    process.stdout.write(usage);
    process.exit(0);
  }
  const result = runPageChange(cli);
  if (result.body) process.stdout.write(`${JSON.stringify(result.body, null, 2)}\n`);
  else if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status);
}
