import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inTreeArchive, loadPins } from "./paths.mjs";

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function kitSpec(version, pins = loadPins()) {
  if (!version || version === pins.defaultVersion || version === pins.released.version) return pins.released;
  if (version === pins.candidate.version) return pins.candidate;
  throw new Error(`unknown kit version ${version}`);
}

export function assertArchive(path, spec) {
  if (!existsSync(path)) {
    const err = new Error(`kit archive missing: ${path}`);
    err.code = "kit-archive-missing";
    throw err;
  }
  const buf = readFileSync(path);
  const digest = createHash("sha256").update(buf).digest("hex");
  if (buf.length !== spec.bytes || digest !== spec.sha256) {
    const err = new Error(`kit pin mismatch size=${buf.length} sha256=${digest} expected ${spec.bytes} ${spec.sha256}`);
    err.code = "kit-pin-mismatch";
    throw err;
  }
  return { bytes: buf.length, sha256: digest, path };
}

export function extractKit(archivePath, spec, dest = mkdtempSync(join(tmpdir(), "hg04-uj-"))) {
  assertArchive(archivePath, spec);
  const tar = spawnSync("tar", ["-xzf", archivePath, "-C", dest], { encoding: "utf8" });
  if (tar.status !== 0) throw new Error(tar.stderr || "tar extract failed");
  const kitDir = join(dest, spec.rootName);
  const bin = join(kitDir, "bin/useful-jobs.mjs");
  if (!existsSync(bin)) throw new Error(`extract missing ${bin}`);
  return { kitDir, bin, extractRoot: dest, spec };
}

export function resolveReleasedArchive({ archivePath = null, pins = loadPins() } = {}) {
  const spec = pins.released;
  const candidates = [archivePath, process.env.USEFUL_JOBS_ARCHIVE, inTreeArchive(pins)].filter(Boolean);
  for (const path of candidates) {
    if (existsSync(path)) return { path, pin: assertArchive(path, spec), spec };
  }
  const err = new Error("released useful-jobs 1.4.0 archive not found locally");
  err.code = "kit-archive-missing";
  throw err;
}

export function runVendorBudgetImpact({ kitDir, beforePath, afterPath, outDir }) {
  mkdirSync(outDir, { recursive: true });
  const proc = spawnSync(
    process.execPath,
    [join(kitDir, "bin/useful-jobs.mjs"), "run", "vendor-budget-impact", "--before", beforePath, "--after", afterPath, "--out-dir", outDir],
    {
      encoding: "utf8",
      cwd: kitDir,
      timeout: 60_000,
      env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=768" },
    },
  );
  let receipt = null;
  try {
    receipt = JSON.parse(String(proc.stdout || "").trim().split("\n").filter(Boolean).at(-1) || "null");
  } catch {
    receipt = null;
  }
  const artifactPath = join(outDir, "budget-impact.json");
  const markdownPath = join(outDir, "budget-impact.md");
  const artifact = existsSync(artifactPath) ? JSON.parse(readFileSync(artifactPath, "utf8")) : null;
  const markdown = existsSync(markdownPath) ? readFileSync(markdownPath, "utf8") : null;
  return { proc, receipt, artifact, markdown, artifactPath, markdownPath };
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function removeExtract(root) {
  if (root && root.includes("hg04-uj-")) rmSync(root, { recursive: true, force: true });
}
