import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPO_ROOT } from "./paths.mjs";

export const SDS52_SHA = "aeef964fa188443078958d9d6d393afae1d542ee";
export const D01_PREV_SHA = "6bed72dd22a396134aa5c957933b42c3a5746698";
export const D01_SHA = "e2f951cae7bb299df2283b9c181bb0d369fc26af";
export const EXECUTION_CONTRACT_VERSION = "samedaydesk.paid-useful-jobs.execution.v1";

const KNOWN = {
  [SDS52_SHA]: ["D15_SDS52_ROOT", join(tmpdir(), "d15-readonly", "sds52-aeef964")],
  [D01_PREV_SHA]: ["D15_D01_PREV_ROOT", join(tmpdir(), "d15-readonly", "d01-6bed72d")],
  [D01_SHA]: ["D15_D01_ROOT", join(tmpdir(), "d15-readonly", "d01-e2f951c")],
};

function wrapperPath(root) {
  return join(root, "server/paid-useful-jobs/lib/wrapper.mjs");
}

function porcelainWorktrees() {
  const r = spawnSync("git", ["worktree", "list", "--porcelain"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (r.status !== 0) return [];
  const rows = [];
  let cur = {};
  for (const line of String(r.stdout || "").split("\n")) {
    if (line.startsWith("worktree ")) cur.path = line.slice("worktree ".length);
    else if (line.startsWith("HEAD ")) cur.head = line.slice("HEAD ".length);
    else if (line === "") {
      if (cur.path) rows.push(cur);
      cur = {};
    }
  }
  if (cur.path) rows.push(cur);
  return rows;
}

function headMatches(head, sha) {
  if (!head || !sha) return false;
  return head === sha || head.startsWith(sha) || sha.startsWith(head);
}

function fetchSha(sha) {
  const tries = [
    ["fetch", "origin", sha],
    ["fetch", "origin", "codex/w5-d01-20260911"],
  ];
  let lastErr = null;
  for (const args of tries) {
    const r = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
    if (r.status === 0 || r.status === null) return;
    lastErr = r.stderr || `git ${args.join(" ")} failed`;
  }
  const err = new Error(lastErr || `git fetch ${sha} failed`);
  err.code = "kernel-fetch-failed";
  throw err;
}

export function ensureKernelRoot(sha) {
  const known = KNOWN[sha] || [];
  const envName = known[0];
  const preferred = envName && process.env[envName];
  const listed = porcelainWorktrees().find((w) => headMatches(w.head, sha));
  const candidates = [preferred, known[1], listed?.path, join(tmpdir(), `d15-ro-${sha.slice(0, 12)}`)].filter(
    Boolean,
  );
  for (const root of candidates) {
    if (existsSync(wrapperPath(root))) return root;
  }
  fetchSha(sha);
  const dest = known[1] || join(tmpdir(), `d15-ro-${sha.slice(0, 12)}`);
  if (existsSync(wrapperPath(dest))) return dest;
  mkdirSync(join(tmpdir(), "d15-readonly"), { recursive: true });
  const add = spawnSync("git", ["worktree", "add", "--detach", dest, sha], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (add.status !== 0) {
    const again = porcelainWorktrees().find((w) => headMatches(w.head, sha));
    if (again && existsSync(wrapperPath(again.path))) return again.path;
    const err = new Error(add.stderr || `git worktree add ${sha} failed`);
    err.code = "kernel-worktree-failed";
    throw err;
  }
  if (!existsSync(wrapperPath(dest))) {
    const err = new Error(`kernel wrapper missing at ${dest}`);
    err.code = "kernel-missing";
    throw err;
  }
  return dest;
}

export function kernelCli(root) {
  return join(root, "server/paid-useful-jobs/bin/cli.mjs");
}

export function kernelServe(root) {
  return join(root, "server/paid-useful-jobs/bin/serve-execution.mjs");
}

export function kernelFixture(root, rel) {
  return join(root, "server/paid-useful-jobs/fixtures", rel);
}

export async function importKernel(root) {
  const wrapper = await import(wrapperPath(root));
  let contract = { EXECUTION_CONTRACT_VERSION: null };
  const contractPath = join(root, "server/paid-useful-jobs/lib/contract.mjs");
  if (existsSync(contractPath)) contract = await import(contractPath);
  const engine = await import(join(root, "server/paid-useful-jobs/lib/engine.mjs"));
  let inputGuard = {};
  const guardPath = join(root, "server/paid-useful-jobs/lib/input-guard.mjs");
  if (existsSync(guardPath)) inputGuard = await import(guardPath);
  return { wrapper, contract, engine, inputGuard };
}
