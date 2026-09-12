import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REPO_ROOT } from "../lib/pins.mjs";

export const here = dirname(fileURLToPath(import.meta.url));
export const moduleRoot = join(here, "..");
export const cli = join(moduleRoot, "bin/mailbox.mjs");
export const beforePath = join(moduleRoot, "fixtures/caller/vendor-budget-impact/before.json");
export const afterPath = join(moduleRoot, "fixtures/caller/vendor-budget-impact/after.json");

export const CLOCK = "2026-09-11T20:00:00Z";
export const EXPIRES = "2026-09-12T20:00:00Z";
export const EXPIRED_CLOCK = "2026-09-13T00:00:00Z";

export function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function runMailbox(args, extra = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: extra.timeout ?? 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

export function ensureD01PinCheckout() {
  return REPO_ROOT;
}

export async function loadD01Library(pinRoot = ensureD01PinCheckout()) {
  const href = pathToFileURL(join(pinRoot, "server/paid-useful-jobs/index.mjs")).href;
  return import(href);
}

export function runD01Wrapper(pinRoot, args, extra = {}) {
  const wrapperCli = join(pinRoot, "server/paid-useful-jobs/bin/cli.mjs");
  return spawnSync(process.execPath, [wrapperCli, ...args], {
    encoding: "utf8",
    cwd: pinRoot,
    timeout: extra.timeout ?? 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

export function parseJson(text) {
  const trimmed = String(text || "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`not JSON: ${trimmed.slice(0, 400)}`);
  return JSON.parse(trimmed.slice(start, end + 1));
}

export function writeRawEnvelope(mailbox, requestId, envelope, files = []) {
  const dir = join(mailbox, requestId, "artifacts");
  mkdirSync(dir, { recursive: true });
  for (const file of files) {
    writeFileSync(join(dir, file.name), file.bytes);
  }
  writeFileSync(join(mailbox, requestId, "envelope.json"), `${JSON.stringify(envelope, null, 2)}\n`);
}

export function writeExecution(execution) {
  const dir = tmp("rmb-exec-json-");
  const path = join(dir, "execution.json");
  writeFileSync(path, `${JSON.stringify(execution, null, 2)}\n`);
  return path;
}

export function seedVendorFromD01({
  mailbox,
  requestId,
  jobId = "vendor-budget-impact",
  before = beforePath,
  after = afterPath,
  example = false,
  extraArgs = [],
} = {}) {
  const published = tmp("rmb-d01-pub-");
  const args = ["run", jobId];
  if (example) args.push("--example");
  if (!example && before) args.push("--before", before);
  if (!example && after) args.push("--after", after);
  args.push("--out-dir", published, ...extraArgs);
  const wrapper = runD01Wrapper(REPO_ROOT, args);
  const execution = parseJson(wrapper.stdout);
  const executionPath = writeExecution(execution);
  const identityDir = execution.runOutDir || published;
  const seed = runMailbox([
    "seed",
    "--mailbox",
    mailbox,
    "--request-id",
    requestId,
    "--job-id",
    jobId,
    "--from-d01-execution",
    executionPath,
    "--from-out-dir",
    identityDir,
    "--clock",
    CLOCK,
    "--expires-at",
    EXPIRES,
  ]);
  return { wrapper, execution, seed, published, identityDir, executionPath };
}
