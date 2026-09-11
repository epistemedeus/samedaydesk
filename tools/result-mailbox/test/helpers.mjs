import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
