import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { PINNED_IMPLEMENTATION } from "./contract.mjs";

export function d01Root() {
  return process.env.SDS_D01_ROOT || "/tmp/sds-d01-ro";
}

export function archivePath() {
  if (process.env.SDS_UJ_ARCHIVE) return process.env.SDS_UJ_ARCHIVE;
  return join(d01Root(), PINNED_IMPLEMENTATION.archive);
}

export function requirePinnedTree() {
  const root = d01Root();
  const archive = archivePath();
  if (!existsSync(root)) {
    throw new Error(`D01 read-only worktree missing at ${root}. Set SDS_D01_ROOT to ${PINNED_IMPLEMENTATION.d01Sha}`);
  }
  if (!existsSync(archive)) {
    throw new Error(`useful-jobs 1.2.0 archive missing at ${archive}`);
  }
  const buf = readFileSync(archive);
  if (buf.length !== PINNED_IMPLEMENTATION.archiveBytes) {
    throw new Error(`archive bytes ${buf.length} != ${PINNED_IMPLEMENTATION.archiveBytes}`);
  }
  const digest = createHash("sha256").update(buf).digest("hex");
  if (digest !== PINNED_IMPLEMENTATION.archiveSha256) {
    throw new Error(`archive sha256 ${digest} != ${PINNED_IMPLEMENTATION.archiveSha256}`);
  }
  return { root, archive, digest, bytes: buf.length };
}

export function isolateDir(prefix = "w5-d16-final-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function extractCold(destParent) {
  const { archive } = requirePinnedTree();
  mkdirSync(destParent, { recursive: true });
  const tar = spawnSync("tar", ["-xzf", archive, "-C", destParent], { encoding: "utf8" });
  if (tar.status !== 0) throw new Error(tar.stderr || "tar extract failed");
  const kit = join(destParent, "useful-jobs-1.2.0");
  if (!existsSync(join(kit, PINNED_IMPLEMENTATION.publicCli))) {
    throw new Error(`extracted kit missing ${PINNED_IMPLEMENTATION.publicCli}`);
  }
  return kit;
}

let sharedKit = null;
let sharedParent = null;

export function sharedColdKit() {
  if (sharedKit && existsSync(join(sharedKit, PINNED_IMPLEMENTATION.publicCli))) return sharedKit;
  sharedParent = isolateDir("w5-d16-final-kit-");
  sharedKit = extractCold(sharedParent);
  return sharedKit;
}

export function wipeSharedKit() {
  if (sharedParent) rmSync(sharedParent, { recursive: true, force: true });
  sharedKit = null;
  sharedParent = null;
}

export function callerBudget() {
  const root = d01Root();
  return {
    before: join(root, "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json"),
    after: join(root, "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json"),
  };
}

export function d01Module(rel) {
  return join(d01Root(), rel);
}
