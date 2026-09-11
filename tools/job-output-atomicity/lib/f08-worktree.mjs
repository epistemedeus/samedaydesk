import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { F08_REF, F08_TESTED_SHA, REPO_ROOT } from "./pins.mjs";

function git(args, cwd = REPO_ROOT) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

export function f08CliExists(root) {
  return Boolean(root) && existsSync(join(root, "server/paid-useful-jobs/bin/cli.mjs"));
}

/**
 * Producer root is this tree's D01 CLI. Historical F08 worktree fetch is not
 * the product pin. F08_ROOT still overrides for an explicit checkout.
 */
export function ensureF08Worktree({ sha = F08_TESTED_SHA, dest } = {}) {
  void sha;
  void dest;
  if (process.env.F08_ROOT && f08CliExists(process.env.F08_ROOT)) {
    return process.env.F08_ROOT;
  }
  if (f08CliExists(REPO_ROOT)) return REPO_ROOT;
  const err = new Error(`D01 CLI missing under ${REPO_ROOT}`);
  err.code = "missing-f08";
  throw err;
}

export { git, F08_REF };
