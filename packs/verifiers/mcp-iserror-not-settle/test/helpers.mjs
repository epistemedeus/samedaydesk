import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = resolve(here, "..");
export const REPO_ROOT = resolve(PACK_ROOT, "../../..");
export const BIN = join(PACK_ROOT, "bin/verify.mjs");
export const FIXTURES = join(PACK_ROOT, "fixtures");
export const SEEDED_REL =
  "packs/verifiers/mcp-iserror-not-settle/fixtures/fail/sds-http-200-unpaid-fixpack-claimed-settle.json";
export const SEEDED = join(REPO_ROOT, SEEDED_REL);

export function runVerify(args, { cwd = REPO_ROOT } = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd,
    maxBuffer: 2 * 1024 * 1024,
  });
}

export function parseStdout(result) {
  const text = String(result.stdout || "").trim();
  return { text, json: text ? JSON.parse(text) : null };
}
