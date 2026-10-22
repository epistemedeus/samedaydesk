import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_SHA256,
  archivePath,
  REPO_ROOT,
} from "../lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const moduleRoot = join(here, "..");
export const cli = join(moduleRoot, "bin/export.mjs");
export const fixtures = join(moduleRoot, "fixtures");

export function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function runExport(args, cwd = REPO_ROOT) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", cwd });
}

export function payload(proc) {
  const text = (proc.stdout || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    return { parseError: true, text };
  }
}

let kitRoot;
export function extractUsefulJobs() {
  if (kitRoot && existsSync(join(kitRoot, "bin/useful-jobs.mjs"))) return kitRoot;
  const archive = archivePath(REPO_ROOT);
  const bytes = readFileSync(archive);
  if (bytes.length !== USEFUL_JOBS_ARCHIVE_BYTES) {
    throw new Error(`useful-jobs archive size ${bytes.length}`);
  }
  if (sha256Hex(bytes) !== USEFUL_JOBS_ARCHIVE_SHA256) {
    throw new Error("useful-jobs archive sha256 mismatch");
  }
  const work = tmp("w4-uj-");
  const tar = spawnSync("tar", ["-xzf", archive, "-C", work], { encoding: "utf8" });
  if (tar.status !== 0) throw new Error(tar.stderr || "tar failed");
  kitRoot = join(work, "useful-jobs-1.0.0");
  return kitRoot;
}

export function ensureD03Worktree() {
  const sha = "58cba6324c1d9793d344bc13154b8b2380e8166f";
  const dest = join(tmpdir(), "w5-d07-d03-ro");
  const marker = join(dest, "tools/job-output-atomicity/bin/verify-complete.mjs");
  if (existsSync(marker)) {
    const head = spawnSync("git", ["-C", dest, "rev-parse", "HEAD"], { encoding: "utf8" });
    if (head.status === 0 && head.stdout.trim() === sha) {
      return { root: dest, cli: marker, sha };
    }
  }
  spawnSync("rm", ["-rf", dest], { encoding: "utf8" });
  const fetch = spawnSync("git", ["-C", REPO_ROOT, "fetch", "origin", sha], { encoding: "utf8" });
  if (fetch.status !== 0) throw new Error(fetch.stderr || "git fetch D03 pin failed");
  const add = spawnSync("git", ["-C", REPO_ROOT, "worktree", "add", "--detach", dest, sha], {
    encoding: "utf8",
  });
  if (add.status !== 0) throw new Error(add.stderr || "git worktree add D03 pin failed");
  if (!existsSync(marker)) throw new Error("D03 verify-complete CLI missing after worktree add");
  return { root: dest, cli: marker, sha };
}

export function runFeedAgendaA(outDir) {
  const kit = extractUsefulJobs();
  mkdirSync(outDir, { recursive: true });
  const proc = spawnSync(
    process.execPath,
    [
      join(kit, "bin/useful-jobs.mjs"),
      "run",
      "feed-agenda",
      "--before",
      "samples/feed/a/before.xml",
      "--after",
      "samples/feed/a/after.xml",
      "--out-dir",
      outDir,
    ],
    { encoding: "utf8", cwd: kit },
  );
  return { kit, proc, json: payload(proc) };
}

export function unzipTo(zipPath, dest) {
  mkdirSync(dest, { recursive: true });
  const proc = spawnSync("unzip", ["-o", "-q", zipPath, "-d", dest], { encoding: "utf8" });
  return proc;
}

export function copyFixture(name) {
  const dest = tmp(`w4-${name}-`);
  cpSync(join(fixtures, name), dest, { recursive: true });
  return dest;
}

export function writeOversize(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "agenda.json"), `${JSON.stringify({ appId: "feed-agenda" })}\n`);
  writeFileSync(join(dir, "agenda.ics"), "BEGIN:VCALENDAR\nEND:VCALENDAR\n");
  writeFileSync(join(dir, "oversize.bin"), Buffer.alloc(8 * 1024 * 1024 + 1, 1));
}

export { rmSync };
