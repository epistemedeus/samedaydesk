import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { ARCHIVE_100, ARCHIVE_110, D01_SHA, H04_CORPUS_SHA } from "./pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const HARNESS_ROOT = join(here, "..");
export const SDS_REPO = resolve(here, "../../../../..");

export const COLD_HOME = join(tmpdir(), "d15-cold-home");
export const COLD_TMP = join(tmpdir(), "d15-cold-tmp");
export const COLD_SRC = join(tmpdir(), "d15-cold-src");
export const COLD_EXTRACT_110 = join(tmpdir(), "d15-cold-customer", "useful-jobs-1.1.0");
export const COLD_EXTRACT_100 = join(tmpdir(), "d15-cold-customer-100", "useful-jobs-1.0.0");
export const COLD_INPUTS = join(tmpdir(), "d15-cold-inputs");
export const COLD_RUNS = join(tmpdir(), "d15-cold-runs");

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

const KEEP_ENV = new Set(["PATH", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "TZ", "USER", "LOGNAME"]);

export function coldEnv(extra = {}) {
  const env = {};
  for (const key of KEEP_ENV) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env.HOME = COLD_HOME;
  env.TMPDIR = COLD_TMP;
  env.TMP = COLD_TMP;
  env.TEMP = COLD_TMP;
  return { ...env, ...extra };
}

function gitShow(sha, rel, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const r = spawnSync("git", ["show", `${sha}:${rel}`], {
    cwd: SDS_REPO,
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) {
    const err = new Error(String(r.stderr || `git show ${sha}:${rel} failed`));
    err.code = "git-show-failed";
    throw err;
  }
  writeFileSync(dest, r.stdout);
  return dest;
}

function materializeArchive(spec, destTar) {
  if (existsSync(destTar) && sha256File(destTar) === spec.sha256) return destTar;
  gitShow(D01_SHA, spec.publicPath, destTar);
  const digest = sha256File(destTar);
  if (digest !== spec.sha256) {
    const err = new Error(`${spec.name} sha256 ${digest} != ${spec.sha256}`);
    err.code = "archive-hash-mismatch";
    throw err;
  }
  const size = readFileSync(destTar).length;
  if (size !== spec.bytes) {
    const err = new Error(`${spec.name} bytes ${size} != ${spec.bytes}`);
    err.code = "archive-size-mismatch";
    throw err;
  }
  return destTar;
}

function extractTar(tarPath, destRoot, expectedDirName) {
  const parent = dirname(destRoot);
  mkdirSync(parent, { recursive: true });
  if (existsSync(join(destRoot, "bin/useful-jobs.mjs")) && existsSync(join(destRoot, "package.json"))) {
    return destRoot;
  }
  const r = spawnSync("tar", ["-xzf", tarPath, "-C", parent], { encoding: "utf8" });
  if (r.status !== 0) {
    const err = new Error(r.stderr || `tar extract failed ${tarPath}`);
    err.code = "extract-failed";
    throw err;
  }
  if (!existsSync(join(parent, expectedDirName, "bin/useful-jobs.mjs"))) {
    const err = new Error(`missing ${expectedDirName}/bin/useful-jobs.mjs after extract`);
    err.code = "extract-missing-entry";
    throw err;
  }
  return join(parent, expectedDirName);
}

export function ensureCold110() {
  mkdirSync(COLD_HOME, { recursive: true });
  mkdirSync(COLD_TMP, { recursive: true });
  mkdirSync(COLD_INPUTS, { recursive: true });
  mkdirSync(COLD_RUNS, { recursive: true });
  const tar = materializeArchive(ARCHIVE_110, join(COLD_SRC, "useful-jobs-1.1.0.tar.gz"));
  return extractTar(tar, COLD_EXTRACT_110, ARCHIVE_110.name);
}

export function ensureCold100() {
  const tar = materializeArchive(ARCHIVE_100, join(COLD_SRC, "useful-jobs-1.0.0.tar.gz"));
  return extractTar(tar, COLD_EXTRACT_100, ARCHIVE_100.name);
}

export function h04File(rel, dest) {
  gitShow(H04_CORPUS_SHA, rel, dest);
  return dest;
}

export function cli110(root = ensureCold110()) {
  return join(root, "bin/useful-jobs.mjs");
}
