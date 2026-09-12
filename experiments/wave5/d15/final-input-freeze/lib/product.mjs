import { existsSync, mkdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ARCHIVE_120, D01_RC_BRANCH, D01_RC_SHA, DELIVER_REL } from "./pins.mjs";
import { sha256File } from "./sha.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const HARNESS_ROOT = join(here, "..");
export const SDS_REPO = resolve(here, "../../../../..");
export const PRELOAD = join(here, "preload.mjs");

export function deliverBin(root) {
  return join(root, DELIVER_REL);
}

function wrapperPath(root) {
  return join(root, "server/paid-useful-jobs/lib/wrapper.mjs");
}

function porcelainWorktrees() {
  const r = spawnSync("git", ["worktree", "list", "--porcelain"], {
    cwd: SDS_REPO,
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
    ["fetch", "origin", D01_RC_BRANCH],
  ];
  let lastErr = null;
  for (const args of tries) {
    const r = spawnSync("git", args, { cwd: SDS_REPO, encoding: "utf8" });
    if (r.status === 0) return;
    lastErr = r.stderr || `git ${args.join(" ")} failed`;
  }
  const err = new Error(lastErr || `git fetch ${sha} failed`);
  err.code = "product-fetch-failed";
  throw err;
}

export function ensureProductRoot(sha = D01_RC_SHA) {
  const preferred = process.env.D15_D01_RC_ROOT;
  const listed = porcelainWorktrees().find((w) => headMatches(w.head, sha));
  const dest = join(tmpdir(), "d15-readonly", `d01-${sha.slice(0, 7)}`);
  const candidates = [preferred, dest, listed?.path].filter(Boolean);
  for (const root of candidates) {
    if (existsSync(wrapperPath(root)) && existsSync(deliverBin(root))) return root;
  }
  fetchSha(sha);
  if (existsSync(wrapperPath(dest))) return dest;
  mkdirSync(join(tmpdir(), "d15-readonly"), { recursive: true });
  const add = spawnSync("git", ["worktree", "add", "--detach", dest, sha], {
    cwd: SDS_REPO,
    encoding: "utf8",
  });
  if (add.status !== 0) {
    const again = porcelainWorktrees().find((w) => headMatches(w.head, sha));
    if (again && existsSync(wrapperPath(again.path))) return again.path;
    const err = new Error(add.stderr || `git worktree add ${sha} failed`);
    err.code = "product-worktree-failed";
    throw err;
  }
  return dest;
}

export function productFixture(root, rel) {
  return join(root, rel);
}

export function archive120Path(root) {
  return join(root, ARCHIVE_120.publicPath);
}

export function inspectArchive120(root = ensureProductRoot()) {
  const path = archive120Path(root);
  if (!existsSync(path)) {
    const err = new Error(`missing ${ARCHIVE_120.publicPath} at ${root}`);
    err.code = "archive-missing";
    throw err;
  }
  return { path, bytes: statSync(path).size, sha256: sha256File(path) };
}

export function gitBlobId(sha, rel) {
  const r = spawnSync("git", ["rev-parse", `${sha}:${rel}`], {
    cwd: SDS_REPO,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    const err = new Error(String(r.stderr || `git rev-parse ${sha}:${rel} failed`));
    err.code = "git-rev-parse-failed";
    throw err;
  }
  return String(r.stdout || "").trim();
}
