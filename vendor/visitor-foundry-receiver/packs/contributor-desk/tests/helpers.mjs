import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const PACK = join(HERE, "..");
export const CLI = join(PACK, "bin/desk.mjs");
export const PAGE = join(PACK, "../../src/pages/labs/contributor-desk.astro");

export function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of Object.keys(env)) {
    if (/^EARNED_WORK_/.test(key) && /(TOKEN|SECRET|KEY|PASSWORD|PRIVATE)/.test(key)) {
      delete env[key];
    }
    if (["PAYOUT_KEY", "PAYOUT_PRIVATE_KEY", "CONTRIBUTOR_PAYOUT_KEY", "WALLET_PRIVATE_KEY"].includes(key)) {
      delete env[key];
    }
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

export function runDesk(args, { env, extra } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd: PACK,
    env: cleanEnv(env ?? extra ?? {}),
    timeout: 20_000,
    maxBuffer: 1_048_576,
  });
  let json = null;
  try {
    json = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    json = null;
  }
  return { ...result, json };
}
