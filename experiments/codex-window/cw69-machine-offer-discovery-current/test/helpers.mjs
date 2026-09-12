import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED = join(here, "..");
export const REPO_ROOT = join(here, "../../../..");
export const OFFER_BIN = join(OWNED, "bin/offer.mjs");
export const CALLER_BEFORE = join(OWNED, "fixtures/before.json");
export const CALLER_AFTER = join(OWNED, "fixtures/after.json");

export function ownedTmp(prefix = "cw69-test-") {
  const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), prefix));
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

export function runOffer(args, { cwd = REPO_ROOT, env = {}, timeout = 120_000 } = {}) {
  const result = spawnSync(process.execPath, [OFFER_BIN, ...args], {
    encoding: "utf8",
    cwd,
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      NODE_OPTIONS: "--max-old-space-size=768",
      ...env,
    },
  });
  let json = null;
  const text = (result.stdout || "").trim();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { ...result, json };
}

export function discoverTo(outPath, extra = []) {
  return runOffer(["discover", "--job-id", "lockfile-pin-delta", "--out", outPath, ...extra]);
}

export function describeTo(discovery, before, after, outPath, extra = []) {
  return runOffer([
    "describe",
    "--discovery",
    discovery,
    "--before",
    before,
    "--after",
    after,
    "--out",
    outPath,
    ...extra,
  ]);
}

export function invokeTo(description, before, after, outDir, extra = []) {
  return runOffer([
    "invoke",
    "--description",
    description,
    "--before",
    before,
    "--after",
    after,
    "--out-dir",
    outDir,
    ...extra,
  ]);
}
