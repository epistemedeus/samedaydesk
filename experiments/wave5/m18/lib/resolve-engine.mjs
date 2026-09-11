import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ENGINE_REL_PATH, ENGINE_SHA, PACKAGE_ROOT, PINS, SDS_ROOT } from "./pins.mjs";

function git(sdsRoot, args) {
  return spawnSync("git", ["-C", sdsRoot, ...args], { encoding: "utf8" });
}

function cliFromRoot(root) {
  const direct = join(root, "bin/page-change.mjs");
  if (existsSync(direct)) {
    return { engineRoot: root, cli: direct };
  }
  const nested = join(root, ENGINE_REL_PATH, "bin/page-change.mjs");
  if (existsSync(nested)) {
    return { engineRoot: join(root, ENGINE_REL_PATH), cli: nested };
  }
  return null;
}

function worktreesMatchingPin(sdsRoot, sha) {
  const result = git(sdsRoot, ["worktree", "list", "--porcelain"]);
  if (result.status !== 0) return [];
  const blocks = String(result.stdout || "").trim().split("\n\n").filter(Boolean);
  const found = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const worktree = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
    const head = lines.find((line) => line.startsWith("HEAD "))?.slice("HEAD ".length);
    if (worktree && head === sha) found.push(worktree);
  }
  return found;
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function resolveEngine({
  sdsRoot = SDS_ROOT,
  engineRoot,
  fetch = true,
} = {}) {
  const configured = engineRoot || process.env.PAGE_CHANGE_ENGINE_ROOT || process.env.W5_M18_ENGINE_ROOT;
  if (configured) {
    const resolved = cliFromRoot(configured);
    if (!resolved) {
      fail("engine_unavailable", `PAGE_CHANGE_ENGINE_ROOT has no page-change CLI: ${configured}`);
    }
    return { ...resolved, sha: ENGINE_SHA, source: "env" };
  }

  const listed = worktreesMatchingPin(sdsRoot, ENGINE_SHA);
  for (const worktree of listed) {
    const resolved = cliFromRoot(worktree);
    if (resolved) return { ...resolved, sha: ENGINE_SHA, source: "git-worktree" };
  }

  const local = join(sdsRoot, ENGINE_REL_PATH);
  const inCheckout = cliFromRoot(local);
  if (inCheckout) return { ...inCheckout, sha: ENGINE_SHA, source: "checkout" };

  const dest = join(PACKAGE_ROOT, ".worktrees/page-change-91b5733");
  const destCli = cliFromRoot(dest);
  if (destCli) return { ...destCli, sha: ENGINE_SHA, source: "local-worktree" };

  if (!fetch) {
    fail(
      "engine_unavailable",
      `page-change engine pin ${ENGINE_SHA} is not in this checkout; set PAGE_CHANGE_ENGINE_ROOT or fetch the worktree`,
    );
  }

  mkdirSync(join(PACKAGE_ROOT, ".worktrees"), { recursive: true });
  const fetched = git(sdsRoot, ["fetch", "--filter=blob:none", "origin", ENGINE_SHA]);
  if (fetched.status !== 0) {
    fail(
      "engine_unavailable",
      `git fetch origin ${ENGINE_SHA} failed: ${(fetched.stderr || fetched.stdout || "").trim()}`,
    );
  }
  const added = git(sdsRoot, ["worktree", "add", "--detach", dest, ENGINE_SHA]);
  if (added.status !== 0 && !existsSync(join(dest, ENGINE_REL_PATH, "bin/page-change.mjs"))) {
    fail(
      "engine_unavailable",
      `git worktree add failed: ${(added.stderr || added.stdout || "").trim()}`,
    );
  }
  const resolved = cliFromRoot(dest);
  if (!resolved) {
    fail("engine_unavailable", `worktree ${dest} does not contain ${PINS.engine.cli}`);
  }
  return { ...resolved, sha: ENGINE_SHA, source: "fetched-worktree" };
}
