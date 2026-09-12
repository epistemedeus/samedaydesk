import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadPin } from "./paths.mjs";

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function verifyKitRoot(root, pin = loadPin()) {
  const pkgPath = join(root, "package.json");
  const enginePkgPath = join(root, "engines/page-change-offline-job/package.json");
  const catalogPath = join(root, "catalog.json");
  const binPath = join(root, "bin/useful-jobs.mjs");
  if (!existsSync(pkgPath) || !existsSync(enginePkgPath) || !existsSync(catalogPath) || !existsSync(binPath)) {
    throw new Error(`useful-jobs kit incomplete at ${root}`);
  }
  const pkg = readJson(pkgPath);
  const enginePkg = readJson(enginePkgPath);
  const catalog = readJson(catalogPath);
  if (pkg.name !== "useful-jobs" || pkg.version !== pin.publicKit.version) {
    throw new Error(`kit package ${pkg.name}@${pkg.version} does not match pin ${pin.publicKit.version}`);
  }
  if (enginePkg.version !== pin.engine.version) {
    throw new Error(`engine ${enginePkg.version} does not match pin ${pin.engine.version}`);
  }
  if (!Array.isArray(catalog.jobs) || catalog.jobs.length !== pin.publicKit.jobCount) {
    throw new Error(`catalog job count ${catalog.jobs?.length} does not match pin ${pin.publicKit.jobCount}`);
  }
  const job = catalog.jobs.find((item) => item.id === pin.publicKit.jobId);
  if (!job) throw new Error(`catalog missing ${pin.publicKit.jobId}`);
  return {
    root: resolve(root),
    bin: binPath,
    engineVersion: enginePkg.version,
    engineId: "samedaydesk.page-change-offline-job",
    jobCount: catalog.jobs.length,
    catalogPin: job.pin?.sha ?? null,
  };
}

function tarCandidates(pin) {
  return [
    process.env.USEFUL_JOBS_KIT_TAR,
    "/tmp/w5-m09-pr114/client/public/for-agents/useful-jobs/useful-jobs-1.2.0.tar.gz",
    "/tmp/w5-m09-kit-1.2.0/useful-jobs-1.2.0.tar.gz",
  ].filter(Boolean);
}

function extractTar(tarPath, pin) {
  const destParent = join(tmpdir(), "w5-m09-fei-kit");
  mkdirSync(destParent, { recursive: true });
  const dest = join(destParent, "useful-jobs-1.2.0");
  if (existsSync(join(dest, "bin/useful-jobs.mjs"))) {
    return verifyKitRoot(dest, pin);
  }
  const unpacked = spawnSync("tar", ["-xzf", tarPath, "-C", destParent], { encoding: "utf8" });
  if (unpacked.status !== 0) {
    throw new Error(`tar extract failed: ${unpacked.stderr || unpacked.stdout}`);
  }
  return verifyKitRoot(dest, pin);
}

export function resolveKit(pin = loadPin()) {
  const envRoot = process.env.USEFUL_JOBS_KIT_ROOT;
  if (envRoot) return verifyKitRoot(envRoot, pin);

  const extracted = [
    "/tmp/w5-m09-kit-1.2.0/useful-jobs-1.2.0",
    join(tmpdir(), "w5-m09-fei-kit/useful-jobs-1.2.0"),
  ];
  for (const root of extracted) {
    if (existsSync(join(root, "bin/useful-jobs.mjs"))) return verifyKitRoot(root, pin);
  }

  for (const tarPath of tarCandidates(pin)) {
    if (!existsSync(tarPath)) continue;
    const digest = sha256File(tarPath);
    if (digest !== pin.publicKit.sha256) {
      throw new Error(`kit tar sha256 ${digest} does not match pin ${pin.publicKit.sha256}`);
    }
    return extractTar(tarPath, pin);
  }

  throw new Error(
    "shipped useful-jobs 1.2.0 kit not found; set USEFUL_JOBS_KIT_ROOT or USEFUL_JOBS_KIT_TAR to the PR114 archive",
  );
}

export function kitTarSha256(tarPath) {
  return sha256File(tarPath);
}

export { dirname };
