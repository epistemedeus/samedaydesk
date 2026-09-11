/**
 * Locate and import the pinned D01 execution.v1 export.
 * Read-only: does not copy server/paid-useful-jobs into this package.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { EXECUTION_CONTRACT_VERSION, TESTED_D01 } from "./constants.mjs";
import { REPO_ROOT } from "./roots.mjs";

export const D01_DEFAULT_WORKTREE = "/tmp/sds-d01-6bed72dd";

export function paidUsefulJobsDir(root) {
  if (!root) return null;
  const resolved = path.resolve(String(root));
  const nested = path.join(resolved, "server/paid-useful-jobs/index.mjs");
  const direct = path.join(resolved, "index.mjs");
  const wrapper = path.join(resolved, "lib/wrapper.mjs");
  if (existsSync(nested)) return path.join(resolved, "server/paid-useful-jobs");
  if (existsSync(direct) && existsSync(wrapper)) return resolved;
  return null;
}

export function d01RepoRoot(root) {
  const paid = paidUsefulJobsDir(root);
  if (!paid) return null;
  if (existsSync(path.join(path.resolve(String(root)), "server/paid-useful-jobs/index.mjs"))) {
    return path.resolve(String(root));
  }
  return path.resolve(paid, "../..");
}

export function resolveSampleGuardPath(d01Root) {
  const paid = paidUsefulJobsDir(d01Root);
  if (!paid) return null;
  const guard = path.join(paid, "lib/sample-guard.mjs");
  return existsSync(guard) ? guard : null;
}

function candidateRoots() {
  const out = [];
  if (process.env.SAMEDAYDESK_D01_ROOT) out.push(process.env.SAMEDAYDESK_D01_ROOT);
  out.push(D01_DEFAULT_WORKTREE);
  return out;
}

function checkoutLooksPinned(repoRoot, sha) {
  const r = spawnSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (r.status !== 0) return existsSync(path.join(repoRoot, "server/paid-useful-jobs/index.mjs"));
  return r.stdout.trim() === sha;
}

/**
 * Return `{ repoRoot, paidRoot, sha }` for TESTED_D01.
 * Uses SAMEDAYDESK_D01_ROOT or the detached worktree; fetches the pin if needed.
 */
export function ensureD01Checkout() {
  const sha = TESTED_D01.sha;
  for (const root of candidateRoots()) {
    const paidRoot = paidUsefulJobsDir(root);
    if (!paidRoot) continue;
    const repoRoot = d01RepoRoot(root);
    if (!repoRoot) continue;
    return { repoRoot, paidRoot, sha, pinned: checkoutLooksPinned(repoRoot, sha) };
  }

  const dest = D01_DEFAULT_WORKTREE;
  const fetch = spawnSync("git", ["fetch", "origin", TESTED_D01.ref], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (fetch.status !== 0) {
    const bySha = spawnSync("git", ["fetch", "origin", sha], { cwd: REPO_ROOT, encoding: "utf8" });
    if (bySha.status !== 0) {
      throw new Error(
        `D01 pin ${sha} is not available (fetch ${TESTED_D01.ref}: ${fetch.stderr || fetch.status})`,
      );
    }
  }
  const add = spawnSync("git", ["worktree", "add", "--detach", dest, sha], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (add.status !== 0 && !paidUsefulJobsDir(dest)) {
    throw new Error(`unable to materialize D01 pin ${sha}: ${add.stderr || add.status}`);
  }
  const paidRoot = paidUsefulJobsDir(dest);
  if (!paidRoot) {
    throw new Error(`D01 worktree at ${dest} is missing server/paid-useful-jobs`);
  }
  return { repoRoot: dest, paidRoot, sha, pinned: true };
}

export async function importD01Execution(root = null) {
  const checkout = root
    ? {
        repoRoot: d01RepoRoot(root),
        paidRoot: paidUsefulJobsDir(root),
        sha: TESTED_D01.sha,
      }
    : ensureD01Checkout();
  if (!checkout?.paidRoot) {
    throw new Error("D01 paid-useful-jobs root was not resolved");
  }
  const indexPath = path.join(checkout.paidRoot, "index.mjs");
  const mod = await import(pathToFileURL(indexPath).href);
  if (mod.EXECUTION_CONTRACT_VERSION !== EXECUTION_CONTRACT_VERSION) {
    throw new Error(
      `D01 contract mismatch at ${indexPath}: expected ${EXECUTION_CONTRACT_VERSION}, got ${mod.EXECUTION_CONTRACT_VERSION}`,
    );
  }
  return { ...checkout, module: mod, indexPath };
}

export async function bindExecutionV1(d01Module = null) {
  const mod = d01Module || (await importD01Execution()).module;
  if (mod.EXECUTION_CONTRACT_VERSION !== EXECUTION_CONTRACT_VERSION) {
    throw new Error(
      `D01 contract mismatch: expected ${EXECUTION_CONTRACT_VERSION}, got ${mod.EXECUTION_CONTRACT_VERSION}`,
    );
  }
  if (typeof mod.createExecutor !== "function" || typeof mod.runPaidOffer !== "function") {
    throw new Error("D01 index.mjs must export createExecutor and runPaidOffer");
  }
  return {
    contract: mod.EXECUTION_CONTRACT_VERSION,
    createExecutor: mod.createExecutor,
    runPaidOffer: mod.runPaidOffer,
    assessDelivery: mod.assessDelivery,
    classifyTransport: mod.classifyTransport,
    classifyAnalysis: mod.classifyAnalysis,
  };
}
