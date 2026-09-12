/**
 * Locate and import the pinned D01 execution.v1 export.
 * Read-only: does not copy server/paid-useful-jobs into this package.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { EXECUTION_CONTRACT_VERSION, TESTED_D01 } from "./constants.mjs";
import { REPO_ROOT } from "./roots.mjs";

export const D01_DEFAULT_WORKTREE = null;

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
  out.push(REPO_ROOT);
  return out;
}

function checkoutLooksPinned(repoRoot) {
  return existsSync(path.join(repoRoot, "server/paid-useful-jobs/index.mjs"));
}

/**
 * Return `{ repoRoot, paidRoot, sha }` for the in-repo execution.v1 export.
 * Does not fetch a historical D01 worktree.
 */
export function ensureD01Checkout() {
  const sha = TESTED_D01.sha;
  for (const root of candidateRoots()) {
    const paidRoot = paidUsefulJobsDir(root);
    if (!paidRoot) continue;
    const repoRoot = d01RepoRoot(root);
    if (!repoRoot) continue;
    return { repoRoot, paidRoot, sha, pinned: checkoutLooksPinned(repoRoot) };
  }
  throw new Error(
    `D01 paid-useful-jobs is not on this tree; set SAMEDAYDESK_D01_ROOT (looked in ${candidateRoots().join(", ")})`,
  );
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
